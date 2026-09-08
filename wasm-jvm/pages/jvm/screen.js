/*
 * screen.js — a reusable "screen surface" for a wasm app rendered to an HTML canvas.
 *
 * It abstracts the three things a windowed wasm app needs from the browser:
 *   1. INPUT   — pointer (down/drag/up/move/wheel) + keyboard, mapped to canvas
 *                coordinates and pushed to the app over the /work/ctrl wire protocol.
 *   2. RENDER  — a requestAnimationFrame loop that presents frames the app publishes,
 *                via WebGL (GPU texture blit) or a 2D context (putImageData), OR by
 *                replaying a Canvas2D vector-command stream natively.
 *   3. EVENTS  — a small send()/on-teardown surface so a host can inject raw events.
 *
 * It is decoupled from the JVM: it only needs a live emscripten-style module
 * ({ HEAP32, HEAPU8, FS }) via getModule(), and the app must speak the /work/ wire
 * protocol below. Any app (Swing/AWT, a game, a custom renderer) can reuse it.
 *
 * Wire protocol — input, written to the /work/ctrl SPSC ring (fallback: /work/ctrl file):
 *   record = [state, a, b];  1 down(x,y)  2 drag(x,y)  3 up(x,y)
 *                            4 key(keyCode,charCode)  5 wheel(0,dy)  6 move(x,y)
 * Wire protocol — output, one of (checked each frame, first that appears wins):
 *   /work/cmdinfo "buf sig w h"  -> Canvas2D command stream at [buf], seq+len at [sig]
 *   /work/fbinfo  "fb  seq w h"  -> RGBA framebuffer in the wasm heap at [fb], seq at [seq]
 *   /work/seq + /work/frame.bin  -> MEMFS RGBA frame (legacy fallback)
 */

// DOM key -> AWT/Java virtual-key code for non-printable keys.
export const VK = { Backspace:8, Tab:9, Enter:13, Shift:16, Control:17, Alt:18, Escape:27,
  ' ':32, PageUp:33, PageDown:34, End:35, Home:36,
  ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40, Delete:127 };

// Input record `state` values (the first field of each /work/ctrl record).
export const CTRL = { DOWN:1, DRAG:2, UP:3, KEY:4, WHEEL:5, MOVE:6 };

export class Screen {
  /*
   * canvas — the target <canvas>. Its width/height are the app's render resolution
   *          (the render loop resizes it to match published frames).
   * opts:
   *   getModule() -> the running emscripten module ({HEAP32,HEAPU8,FS}) or null
   *   present     'webgl' | '2d' | undefined  (how framebuffer frames are shown)
   *   input       bind pointer+keyboard listeners (default true)
   *   mousemove   forward hover moves (state 6) even when not dragging (default false)
   *   renderLoop  run the present loop (default true; set false when something else,
   *               e.g. a WebGL translator, owns the drawing)
   *   onLog(msg)  optional diagnostic sink
   */
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.opts = opts;
    this._getModule = opts.getModule || (() => null);
    this._log = opts.onLog || (() => {});
    this._raf = 0; this._seq = 0; this._ctrlFd = null; this._ctrlRing = null;
    this._listeners = [];   // [type, handler, target] for teardown
  }

  /* Bind input (unless input:false) and start the present loop (unless renderLoop:false). */
  start() {
    if (this.opts.input !== false) this._bindInput();
    if (this.opts.renderLoop !== false) this._startRender();
    return this;
  }

  /* Detach listeners and stop the present loop. */
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf), this._raf = 0;
    for (const [t, h, el] of this._listeners) el.removeEventListener(t, h);
    this._listeners = [];
  }

  /* Inject a raw event: {type:'key',keyCode,charCode} | {type:'pointer',state,x,y} | {type:'wheel',dy} */
  send(ev) {
    if (ev.type === 'key') this._pushCtrl(CTRL.KEY, ev.keyCode||0, ev.charCode||0);
    else if (ev.type === 'wheel') this._pushCtrl(CTRL.WHEEL, 0, ev.dy||0);
    else if (ev.type === 'pointer') this._pushCtrl(ev.state||CTRL.DOWN, ev.x||0, ev.y||0);
  }

  // ---- input --------------------------------------------------------------

  _on(el, type, handler, opts) { el.addEventListener(type, handler, opts); this._listeners.push([type, handler, el]); }

  // Map a DOM pointer event to canvas pixel coords, honoring object-fit letterboxing.
  _toCanvas(e) {
    const cv = this.cv, r = cv.getBoundingClientRect();
    const s = Math.min(r.width / cv.width, r.height / cv.height);
    const dw = cv.width * s, dh = cv.height * s;
    const ox = r.left + (r.width - dw) / 2, oy = r.top + (r.height - dh) / 2;
    return [clamp(Math.round((e.clientX - ox) / s), cv.width - 1),
            clamp(Math.round((e.clientY - oy) / s), cv.height - 1)];
  }

  _bindInput() {
    const cv = this.cv, mousemove = this.opts.mousemove;
    cv.style.touchAction = 'none'; cv.tabIndex = 0;
    let drag = false;
    this._on(cv, 'pointerdown', (e) => { drag = true; cv.focus(); cv.setPointerCapture(e.pointerId); const [x,y]=this._toCanvas(e); this._pushCtrl(CTRL.DOWN,x,y); });
    this._on(cv, 'pointermove', (e) => { const [x,y]=this._toCanvas(e); if (drag) this._pushCtrl(CTRL.DRAG,x,y); else if (mousemove) this._pushCtrl(CTRL.MOVE,x,y); });
    this._on(cv, 'pointerup',   (e) => { if (drag) { drag = false; const [x,y]=this._toCanvas(e); this._pushCtrl(CTRL.UP,x,y); } });
    this._on(cv, 'wheel', (e) => { e.preventDefault(); this._pushCtrl(CTRL.WHEEL, 0, clamp2(Math.round(e.deltaY), 80)); }, { passive: false });
    this._on(cv, 'keydown', (e) => {
      const kc = e.key in VK ? VK[e.key] : 0, ch = e.key.length === 1 ? e.key.charCodeAt(0) : 0;
      if (kc || ch) { e.preventDefault(); this._pushCtrl(CTRL.KEY, kc, ch); }
    });
  }

  // Enqueue an input record. Preferred: a lock-free SPSC ring in the shared wasm heap
  // (we are the single producer) -- write the record, then Atomics-store head, so the
  // app's consumer sees it with no MEMFS write/proxy. Falls back to the /work/ctrl text
  // file until the app publishes /work/ctrlinfo.
  _pushCtrl(state, a, b) {
    const M = this._getModule(); if (!M) return;
    if (!this._ctrlRing && M.FS) {
      try {
        const info = M.FS.readFile('/work/ctrlinfo', { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
        if (info.length === 2 && info[0] > 0) {
          const hIdx = info[0] >> 2;
          this._ctrlRing = { hIdx, tIdx: hIdx + 1, recIdx: hIdx + 3, cap: info[1] };
        }
      } catch (_) {}
    }
    const r = this._ctrlRing;
    if (r && M.HEAP32) {
      const H = M.HEAP32, head = Atomics.load(H, r.hIdx), tail = Atomics.load(H, r.tIdx);
      if (head - tail < r.cap) {                       // space available
        const base = r.recIdx + (head % r.cap) * 3;
        H[base] = state | 0; H[base + 1] = a | 0; H[base + 2] = b | 0;
        Atomics.store(H, r.hIdx, head + 1);            // publish (release)
      }
      return;                                          // (full -> drop; UI is behind)
    }
    this._writeCtrl(`${++this._seq} ${state} ${a} ${b}\n`);
  }

  _writeCtrl(line) {
    const M = this._getModule(); if (!M) return;
    try {
      const b = new TextEncoder().encode(line);
      if (this._ctrlFd == null) this._ctrlFd = M.FS.open('/work/ctrl', 'a');
      M.FS.write(this._ctrlFd, b, 0, b.length);
    } catch (_) {}
  }

  // ---- render -------------------------------------------------------------

  _startRender() {
    const cv = this.cv, present = this.opts.present;
    const wantGL = present === 'webgl';
    // Don't claim a 2D context if presenting via WebGL (a canvas allows only one kind).
    const glc = wantGL ? (cv.getContext('webgl', { alpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false })
                        || cv.getContext('experimental-webgl')) : null;
    const P = glc ? makeGLPresenter(glc) : null;
    if (wantGL && !P) this._log('[screen] WebGL unavailable; using 2D canvas');
    const ctx2d = P ? null : cv.getContext('2d');
    const c2d = P ? null : ctx2d;   // the Canvas2D command-replay path shares the 2D ctx
    const replay = c2d ? makeCmdReplay(c2d) : null;

    let last = -1;
    let shared = null;   // {fb, seq, w, h} once /work/fbinfo appears (zero-copy path)
    let cmd = null;      // {buf, sig, w, h} once /work/cmdinfo appears

    const draw = () => {
      const M = this._getModule();
      if (M) try {
        // 1. Canvas2D command stream (vector ops replayed natively; no framebuffer blit).
        if (!cmd && c2d) { try { const t = M.FS.readFile('/work/cmdinfo', { encoding:'utf8' }).trim().split(/\s+/).map(Number);
                            if (t.length===4 && t[0]>0) { cmd = { buf:t[0], sig:t[1], w:t[2], h:t[3] };
                              this._log('[screen] cmdinfo found; present='+present); } } catch(_){} }
        if (cmd) {
          const seq = M.HEAP32[cmd.sig >> 2];
          if (seq !== last) {
            last = seq;
            const len = M.HEAP32[(cmd.sig >> 2) + 1];
            if (cv.width !== cmd.w || cv.height !== cmd.h) { cv.width = cmd.w; cv.height = cmd.h; }
            try { replay(new DataView(M.HEAPU8.buffer, cmd.buf, len), len); }
            catch (e) { this._log('[screen] replay error: ' + e + ' seq=' + seq + ' len=' + len); }
          }
          this._raf = requestAnimationFrame(draw);
          return;
        }
        // 2. Zero-copy shared-heap framebuffer: the app writes RGBA into the wasm heap
        //    and bumps a sequence int -- read both with no MEMFS I/O and no copy.
        if (!shared) {
          try {
            const info = M.FS.readFile('/work/fbinfo', { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
            if (info.length === 4 && info[0] > 0) shared = { fb: info[0], seq: info[1], w: info[2], h: info[3] };
          } catch (_) {}
        }
        if (shared) {
          const s = M.HEAP32[shared.seq >> 2];
          if (s !== last) {
            last = s;
            const w = shared.w, h = shared.h;
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
            const view = M.HEAPU8.subarray(shared.fb, shared.fb + w * h * 4);
            if (P) P(w, h, view);
            else ctx2d.putImageData(new ImageData(new Uint8ClampedArray(view), w, h), 0, 0);
          }
          this._raf = requestAnimationFrame(draw);
          return;
        }
        // 3. Legacy MEMFS frame file.
        const seq = M.FS.readFile('/work/seq', { encoding: 'utf8' });
        if (seq !== last) {
          last = seq;
          const d = M.FS.readFile('/work/frame.bin');
          const px = d.length / 4; let w = cv.width, h = cv.height;
          if (w * h !== px) for (const [kw,kh] of [[854,480],[640,460],[480,360],[460,340],[440,320],[520,380]]) if (kw*kh===px){w=kw;h=kh;break;}
          if (cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
          const view = new Uint8Array(d.buffer, d.byteOffset, w*h*4);
          if (P) P(w, h, view);
          else ctx2d.putImageData(new ImageData(new Uint8ClampedArray(d.buffer,d.byteOffset,w*h*4),w,h),0,0);
        }
      } catch (_) {}
      this._raf = requestAnimationFrame(draw);
    };
    this._raf = requestAnimationFrame(draw);
  }
}

// ---- Canvas2D command-stream replay ----------------------------------------
// Decodes the vector-op stream a Java2D-on-Canvas backend records into a shared buffer
// and replays it onto a 2D context. Returns replay(dataView, len).
function makeCmdReplay(g) {
  const FONTS = { SansSerif:'sans-serif', Dialog:'sans-serif', DialogInput:'monospace',
                  Serif:'serif', Monospaced:'monospace', Default:'sans-serif' };
  const utf8dec = new TextDecoder();
  const roundRect = (x,y,w,h,r) => { r=Math.max(0,Math.min(r,Math.min(w,h)/2));
    g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
    g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); };
  const ellipse = (x,y,w,h) => { g.beginPath(); g.ellipse(x+w/2,y+h/2,Math.max(0,w/2),Math.max(0,h/2),0,0,Math.PI*2); };
  let clipped = false;
  return function replay(dv, len) {
    let p = 0;
    const u8 = () => dv.getUint8(p++);
    const i = () => { const v = dv.getInt32(p, true); p += 4; return v; };
    const f = () => { const v = dv.getFloat32(p, true); p += 4; return v; };
    // .slice() copies out of the SharedArrayBuffer -- TextDecoder rejects shared views.
    const s = () => { const n = i(); const b = new Uint8Array(dv.buffer, dv.byteOffset + p, n); p += n; return utf8dec.decode(b.slice()); };
    if (clipped) { g.restore(); clipped = false; }   // undo prior frame's RESETCLIP save
    while (p < len) {
      const op = u8();
      switch (op) {
        case 0x01: g.save(); break;
        case 0x02: g.restore(); break;
        case 0x03: { const x=i(),y=i(),w=i(),h=i(); g.setTransform(1,0,0,1,0,0); g.save(); clipped=true;
                     g.beginPath(); g.rect(x,y,w,h); g.clip(); g.fillStyle='rgb(30,30,34)'; g.fillRect(x,y,w,h); break; }
        case 0x10: { const v=i()>>>0; const css=`rgba(${(v>>>24)&255},${(v>>>16)&255},${(v>>>8)&255},${(v&255)/255})`;
                     g.fillStyle=css; g.strokeStyle=css; break; }
        case 0x11: { const st=i(),sz=i(),nm=s(); g.font=`${(st&2)?'italic ':''}${(st&1)?'bold ':''}${sz}px ${FONTS[nm]||'sans-serif'}`; g.textBaseline='alphabetic'; break; }
        case 0x12: g.globalAlpha = i()/255; break;
        case 0x13: g.lineWidth = i(); break;
        case 0x14: { const x=i(),y=i(),w=i(),h=i(); g.beginPath(); g.rect(x,y,w,h); g.clip(); break; }
        case 0x15: { const a=f(),b=f(),c=f(),d=f(),e=f(),ff=f(); g.setTransform(a,b,c,d,e,ff); break; }
        case 0x20: { const x=i(),y=i(),w=i(),h=i(); g.fillRect(x,y,w,h); break; }
        case 0x21: { const x=i(),y=i(),w=i(),h=i(); g.strokeRect(x,y,w,h); break; }
        case 0x22: { const x1=i(),y1=i(),x2=i(),y2=i(); g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); break; }
        case 0x23: { const x=i(),y=i(),w=i(),h=i(),aw=i(),ah=i(); roundRect(x,y,w,h,Math.min(aw,ah)/2); g.fill(); break; }
        case 0x24: { const x=i(),y=i(),w=i(),h=i(),aw=i(),ah=i(); roundRect(x,y,w,h,Math.min(aw,ah)/2); g.stroke(); break; }
        case 0x25: { const x=i(),y=i(),w=i(),h=i(); ellipse(x,y,w,h); g.fill(); break; }
        case 0x26: { const x=i(),y=i(),w=i(),h=i(); ellipse(x,y,w,h); g.stroke(); break; }
        case 0x27: { const x=i(),y=i(),w=i(),h=i(); g.clearRect(x,y,w,h); break; }
        case 0x30: { const x=i(),y=i(),str=s(); g.fillText(str,x,y); break; }
        case 0x40: g.beginPath(); break;
        case 0x41: { const x=f(),y=f(); g.moveTo(x,y); break; }
        case 0x42: { const x=f(),y=f(); g.lineTo(x,y); break; }
        case 0x43: { const cx=f(),cy=f(),x=f(),y=f(); g.quadraticCurveTo(cx,cy,x,y); break; }
        case 0x44: { const a=f(),b=f(),c=f(),d=f(),x=f(),y=f(); g.bezierCurveTo(a,b,c,d,x,y); break; }
        case 0x45: g.closePath(); break;
        case 0x46: g.fill(); break;
        case 0x47: g.stroke(); break;
        default: p = len; break;   // unknown op -> stop (desync guard)
      }
    }
  };
}

// ---- WebGL presenter -------------------------------------------------------
/* Uploads an RGBA framebuffer as a texture and draws it on a full-screen quad.
 * Returns present(w,h,rgbaBytes), or null if setup fails. */
export function makeGLPresenter(gl) {
  const VS = 'attribute vec2 p; varying vec2 uv;' +
             'void main(){ uv = vec2((p.x+1.0)*0.5, (1.0-p.y)*0.5); gl_Position = vec4(p,0.0,1.0); }';
  // Pixels arrive in native little-endian int order (0x00RRGGBB -> bytes B,G,R,0),
  // so swizzle .bgr back to RGB and force alpha opaque. This lets the Java side skip
  // a per-pixel channel shuffle and hand us the raw framebuffer ints.
  const FS = 'precision mediump float; varying vec2 uv; uniform sampler2D t;' +
             'void main(){ gl_FragColor = vec4(texture2D(t, uv).bgr, 1.0); }';
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(prog, 't'), 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  let tw = 0, th = 0;
  return function present(w, h, rgba) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (w === tw && h === th) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba); tw = w; th = h; }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

export function clamp(v, hi) { return Math.max(0, Math.min(hi, v)); }
export function clamp2(v, m) { return Math.max(-m, Math.min(m, v)); }
