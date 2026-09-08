/*
 * WasmJVM — an integration kernel for the OpenJDK-21 → WebAssembly runtime.
 *
 * One small ES module that embeds the JVM in any web app. It turns a declarative
 * config object into everything the runtime needs: it picks the smallest capable
 * artifact, wires the MEMFS control files the launcher reads, stages application
 * jars or source, mounts persistent storage, connects networking, and binds the
 * canvas + input for Swing/AWT (Java2D→canvas) or WebGL (LWJGL/Minecraft).
 *
 *   import { WasmJVM } from './wasmjvm.js';
 *   const jvm = new WasmJVM({ app: { source: 'public class Main{...}' } });
 *   await jvm.start();
 *
 * See FRAMEWORK.md for the full guide. Zero dependencies; browser + Node.
 */

// The canvas surface — pointer/keyboard event handling + the frame present loop —
// lives in a reusable, JVM-agnostic module. WasmJVM just sizes/lays out the canvas
// and hands Screen a live module accessor; Screen owns events, mouse and rendering.
import { Screen } from './screen.js';
// Networking (relay-URL resolution, socket-proxy tier hint, /work/bridge staging,
// relay reachability probe) is likewise a reusable, JVM-agnostic module.
import { Net } from './net.js';
export { Net } from './net.js';   // re-export so hosts can `import { WasmJVM, Net }`

// There is ONE universal JVM artifact ('jvm-full.js'): Swing/AWT/Java2D + the
// WebGL/OpenGL translator + the TCP socket proxy + in-VM javac, all in one ~8 MB
// wasm. Everything else is Java modules, delivered as data packs. The smaller
// single-capability builds remain for size-sensitive embeds, but the default is
// the universal one so callers never pick a "tier".
const TIERS = {
  full:   'jvm-full.js',    // the universal JVM: AWT + OpenGL + TCP sockets
  base:   'jvm-base.js',    // (slim) plain Java only, no AWT/GL/net natives
  awt:    'jvm-awt.js',     // (slim, DEFAULT) Swing/AWT/Java2D, no socket proxy — boots clean
  awtnet: 'jvm-awt-net.js', // awt + POSIX socket proxy; only when networking is configured
  gl:     'jvm-gl.js',      // (slim) AWT + OpenGL, no socket proxy
  net:    'jvm-net.js',     // (slim) base + sockets only
};

// Per-page-load cache-bust token. The artifact .js and its .wasm/.worker.js siblings
// are fetched separately; without a shared version the browser can pair a FRESH .js
// with a STALE cached .wasm from a different build -> a LinkError (e.g. a missing
// websocket import). Tagging every artifact URL with one token generated at page load
// guarantees a consistent, fresh set each run ("start from scratch"); it stays stable
// within the page so repeated Runs reuse the cache. Override per-JVM with
// runtime.cacheBust: false (disable) or a fixed string (pin to a build for caching).
const RUNTIME_LOAD_ID = (typeof Date !== 'undefined' && Date.now) ? String(Date.now()) : '0';

export class WasmJVM {
  constructor(config = {}) {
    this.cfg = config;
    this.module = null;
    this._persist = null;
    this._screen = null;   // the reusable canvas surface (events + rendering)
  }

  /* Pick the artifact. Default 'awt' (Swing/Java2D) boots clean but has no socket
   * proxy. When networking is configured we switch to 'awtnet' (awt + POSIX socket
   * proxy) — kept separate because the socket-proxy build blocks at boot unless a
   * relay bridge is connected, so it's only used when a relay is actually set up. */
  _tier() {
    const c = this.cfg;
    if (c.runtime && c.runtime.tier) return c.runtime.tier;   // explicit override
    if (Net.needsProxy(c.network)) return 'awtnet';           // networking requested
    // 'full' adds the OpenGL translator but its browser canvas/GL init still needs
    // on-device verification, so opt in with runtime.tier:'full' for GL apps.
    return 'awt';
  }

  _artifactUrl() {
    const c = this.cfg;
    if (typeof c.runtime === 'string') return c.runtime;         // explicit URL
    const base = (c.runtime && c.runtime.basePath) || '';        // e.g. '/jvm/'
    return base.replace(/\/?$/, base ? '/' : '') + TIERS[this._tier()];
  }

  // Cache-bust query for artifact URLs (empty when disabled). See RUNTIME_LOAD_ID.
  _bust() {
    const cb = this.cfg.runtime && this.cfg.runtime.cacheBust;
    if (cb === false) return '';
    return 'wjv=' + encodeURIComponent(typeof cb === 'string' ? cb : RUNTIME_LOAD_ID);
  }
  _withBust(u) { const b = this._bust(); return b ? u + (u.includes('?') ? '&' : '?') + b : u; }

  async _loadFactory(url) {
    if (typeof window === 'undefined') return require(url);       // Node
    if (window.createJVM) return window.createJVM;               // already loaded (same page)
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = this._withBust(url); s.onload = res; s.onerror = () => rej(new Error('failed to load ' + url));
      document.body.appendChild(s);
    });
    return window.createJVM;
  }

  async _fetchBytes(src) {
    if (src instanceof Uint8Array) return src;
    if (src instanceof ArrayBuffer) return new Uint8Array(src);
    if (src && src.bytes) return this._fetchBytes(src.bytes);
    const r = await fetch(src);                                  // URL string
    if (!r.ok) throw new Error('fetch ' + src + ' -> ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }

  /* Resolve the app config into (mainClass, control files, staged files). */
  async _plan() {
    const c = this.cfg, app = c.app || {};
    const files = {};        // MEMFS path -> Uint8Array | string  (written in preRun)
    const enc = (s) => new TextEncoder().encode(s);

    // main class + program args
    let mainClass = app.mainClass || 'Hello';
    if (app.args && app.args.length) files['/work/args'] = app.args.join('\n') + '\n';

    // compile-and-run source (uses the bundled Runner)
    if (app.source) {
      files['/work/src.java'] = app.source;
      mainClass = 'Runner';
      if (app.uselib) files['/work/uselib'] = app.uselib;        // extra classpath dir for Runner
    }

    // stage jars: {path, url|bytes} or a plain URL (defaults under /app/lib)
    const stagedJars = [];
    for (const j of (app.jars || [])) {
      const path = (j && j.path) || ('/app/lib/' + (j.name || basename(j)));
      files[path] = await this._fetchBytes(j.url || j.bytes || j);
      stagedJars.push(path);                 // each jar file goes on the classpath
    }

    // Arbitrary staged files (e.g. a whole selected folder tree). Written to their
    // given MEMFS path but NOT auto-added to the classpath — the caller controls
    // classpath via app.classpath (typically the folder root + its jars).
    for (const f of (app.files || [])) {
      files[f.path] = f.bytes ? (f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes))
                              : await this._fetchBytes(f.url);
    }

    // classpath: /app plus each staged jar (a dir entry does NOT include jars in it)
    let cp = app.classpath;
    if (!cp) { cp = ['/app', ...stagedJars]; }
    files['/work/classpath'] = (Array.isArray(cp) ? cp.join(':') : cp);

    // Which data packs this config needs (modular distribution).
    const packs = this._selectPacks();

    // --add-modules must match the packs actually loaded, else the boot layer
    // fails with "Module X not found". Compose from packs + user modules.
    const mods = new Set(['java.logging', 'jdk.unsupported']);
    if (packs.has('compiler')) ['jdk.compiler', 'java.compiler', 'jdk.zipfs', 'jdk.internal.opt'].forEach(m => mods.add(m));
    if (packs.has('desktop')) mods.add('java.desktop');
    for (const m of (c.addModules || [])) mods.add(m);
    files['/work/addmods'] = [...mods].join(',');

    // VM options. The zero-copy framebuffer reads a direct-buffer address via
    // reflection, which needs java.nio opened; add it automatically whenever the
    // app renders, so callers don't have to know that framework detail.
    const vmopts = [...(c.vmOptions || [])];
    const r = c.render || {};
    if ((r.mode === 'awt' || r.mode === 'gl' || r.canvas) &&
        !vmopts.some(o => o.startsWith('--add-opens=java.base/java.nio')))
      vmopts.push('--add-opens=java.base/java.nio=ALL-UNNAMED');
    if (vmopts.length) files['/work/vmopts'] = vmopts.join('\n') + '\n';

    // Networking bridge: written only when a relay URL is configured, which also
    // selects the socket-proxy artifact (_tier -> 'awtnet'). The launcher connects
    // this bridge before JNI_CreateJavaVM. `network.enabled` is a localhost shorthand.
    Net.stage(files, this.cfg.network);

    return { mainClass, files, enc, packs };
  }

  /* The data packs a config requires. 'core' always; 'compiler' when compiling
   * source or asking for jdk.compiler; 'desktop' for any Swing/AWT/WebGL. */
  _selectPacks() {
    const c = this.cfg, app = c.app || {}, r = c.render || {};
    if (c.runtime && c.runtime.packs) return new Set(c.runtime.packs);
    const packs = new Set(['core']);
    const tier = this._tier();
    if (app.source || (c.addModules || []).includes('jdk.compiler')) packs.add('compiler');
    if (tier === 'awt' || tier === 'gl' || r.mode === 'awt' || r.mode === 'gl') packs.add('desktop');
    return packs;
  }

  _packsBase(artUrl) {
    if (this.cfg.runtime && this.cfg.runtime.packsPath) return this.cfg.runtime.packsPath.replace(/\/?$/, '/');
    return artUrl.slice(0, artUrl.lastIndexOf('/') + 1) + 'packs/';
  }

  /* Fetch one pack (.data blob + .data.metadata JSON) and populate MEMFS. */
  async _loadPack(M, baseUrl, name) {
    const [meta, buf] = await Promise.all([
      fetch(baseUrl + name + '.data.metadata').then(r => r.json()),
      fetch(baseUrl + name + '.data').then(r => r.arrayBuffer()),
    ]);
    const bytes = new Uint8Array(buf);
    for (const f of meta.files) {
      const dir = f.filename.slice(0, f.filename.lastIndexOf('/'));
      if (dir) mkdirp(M, dir);
      M.FS.writeFile(f.filename, bytes.subarray(f.start, f.end));
    }
  }

  /* Lazy-register a module pack (CheerpJ-style): present its whole file tree as
   * correctly-sized placeholders (so `stat`/package scans pass and the module
   * graph -- incl. ALL-SYSTEM -- resolves at boot), with real module-info bytes,
   * but DEFER the class bytes. The first read of any class in the module triggers
   * a one-time synchronous fetch of the whole pack, filling every file's real
   * content. Only modules an app actually touches are ever downloaded.
   * Browser-only (uses a synchronous XHR on read); Node loads packs eagerly. */
  async _registerLazyPack(M, baseUrl, name, onFetch) {
    const meta = await fetch(baseUrl + name + '.data.metadata').then(r => r.json());
    const files = meta.files, packUrl = baseUrl + name + '.data';
    const mi = files.find(f => f.filename.endsWith('/module-info.class'));
    // module-info must be real at boot for resolution -> range-fetch just it.
    let miBytes = new Uint8Array(0);
    if (mi) miBytes = new Uint8Array(await fetch(packUrl,
      { headers: { Range: `bytes=${mi.start}-${mi.end - 1}` } }).then(r => r.arrayBuffer()));

    const state = { loaded: false };
    const fetchPack = () => {                   // one-time synchronous pack download
      if (state.loaded) return; state.loaded = true;
      const xhr = new XMLHttpRequest();
      xhr.open('GET', packUrl, false);          // synchronous
      xhr.overrideMimeType('text/plain; charset=x-user-defined');   // read bytes via responseText
      xhr.send(null);
      const s = xhr.responseText, b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
      for (const f of files) {
        try { const n = M.FS.lookupPath(f.filename).node;
              n.contents = b.subarray(f.start, f.end); n.usedBytes = f.end - f.start; } catch (e) {}
      }
      if (onFetch) onFetch(name, b.length);
    };

    for (const f of files) {
      const dir = f.filename.slice(0, f.filename.lastIndexOf('/'));
      if (dir) mkdirp(M, dir);
      const size = f.end - f.start, isMI = (f === mi);
      M.FS.writeFile(f.filename, isMI ? miBytes : new Uint8Array(0));
      const node = M.FS.lookupPath(f.filename).node;
      node.usedBytes = size;                    // correct size for stat, even while empty
      if (isMI) continue;                        // module-info already real
      const realRead = node.stream_ops.read;
      node.stream_ops = Object.assign({}, node.stream_ops, {
        read(stream, buffer, offset, length, position) {
          if (!state.loaded) fetchPack();        // fill this (and every) file, then read for real
          return realRead(stream, buffer, offset, length, position);
        }
      });
    }
  }

  async start() {
    const c = this.cfg;
    const url = this._artifactUrl();
    const factory = await this._loadFactory(url);
    const plan = await this._plan();
    const render = c.render || {};
    const self = this;

    // The .wasm/.data/.worker.js siblings must resolve next to the artifact JS,
    // not the host page — emscripten asks locateFile for each.
    const artDir = url.slice(0, url.lastIndexOf('/') + 1);

    const opts = {
      arguments: [plan.mainClass],
      // Tag every sibling (.wasm/.worker.js/.data) with the same token as the .js so
      // the browser can never mix a fresh .js with a cached .wasm from another build.
      locateFile: (p) => self._withBust(artDir + p),
      print:    (s) => (c.onStdout || noop)(s),
      printErr: (s) => (c.onStderr || c.onStdout || noop)(s),
      onExit:   (code) => (c.onExit || noop)(code),
      preRun: [ (M) => {
        self.module = M;
        try { M.FS.mkdir('/work'); } catch (e) {}
        // environment variables read by the launcher/VM. getenv() reads Module.ENV.
        // `jit` (default on) enables the bytecode->wasm JIT via WASMJIT_ALL; callers
        // can still set env.WASMJIT_ALL or other vars explicitly.
        M.ENV = M.ENV || {};
        if (c.jit !== false) M.ENV.WASMJIT_ALL = '1';
        if (c.env) for (const k in c.env) M.ENV[k] = String(c.env[k]);
        // Fetch + populate the JDK module packs before boot (they carry /jdk and
        // /app). The caller chooses WHICH packs: the default "runtime profile"
        // (JDK minus dev/build tools) or the full set. Java resolves the whole
        // module graph at boot, so a module must be fully present to be usable --
        // there is no partial/lazy module state; "lazy" here means shipping fewer.
        const packsBase = self._packsBase(url);
        const rt = c.runtime || {};
        const all = [...plan.packs];
        // Lazy-FS (browser): load the small boot set fully, register the rest as
        // fetch-on-read placeholders. Otherwise load everything eagerly.
        const lazy = rt.lazyFS && typeof XMLHttpRequest !== 'undefined' && Array.isArray(rt.bootPacks);
        const bootSet = lazy ? new Set(rt.bootPacks.filter((n) => all.includes(n))) : new Set(all);
        const eager = all.filter((n) => bootSet.has(n));
        const deferred = lazy ? all.filter((n) => !bootSet.has(n)) : [];
        M.addRunDependency('jdk-packs');
        Promise.all([
          ...eager.map((n) => self._loadPack(M, packsBase, n)),
          ...deferred.map((n) => self._registerLazyPack(M, packsBase, n,
            (mod, len) => (c.onStdout || noop)('[WasmJVM] lazy-loaded ' + mod + ' (' + (len >> 10) + ' KB)'))),
        ]).then(() => M.removeRunDependency('jdk-packs'))
          .catch((e) => { (c.onStderr || console.error)('[WasmJVM] pack load failed: ' + e); M.removeRunDependency('jdk-packs'); });
        // persistent storage (IDBFS) — mount + hydrate before the app runs
        if (c.storage && c.storage.enabled && M.IDBFS) self._mountStorage(M, c.storage);
        // control files + staged jars
        for (const [path, data] of Object.entries(plan.files)) {
          const dir = path.slice(0, path.lastIndexOf('/'));
          if (dir) mkdirp(M, dir);
          M.FS.writeFile(path, typeof data === 'string' ? plan.enc(data) : data);
        }
      } ],
    };

    // WebGL renderer commits frames straight to a canvas the translator finds by
    // the #glsurface selector; give it that canvas before the module boots.
    if (render.mode === 'gl' && typeof document !== 'undefined') {
      const cv = resolveCanvas(render.canvas);
      cv.id = 'glsurface';
      const [w, h] = viewportSize(render);
      cv.width = w; cv.height = h;
      applyViewport(cv, render);
      opts.canvas = cv;
    }

    const p = factory(opts);
    if (render.mode && render.mode !== 'headless' && typeof document !== 'undefined') {
      this._bindCanvas(render);
    }
    if (c.onReady) p.then(() => c.onReady());
    return p;
  }

  _mountStorage(M, storage) {
    this._persist = M;
    const mount = storage.mount || '/home/web_user';
    try {
      mkdirp(M, mount);
      M.FS.mount(M.IDBFS, {}, mount);
      M.addRunDependency('idbfs');
      M.FS.syncfs(true, () => M.removeRunDependency('idbfs'));   // hydrate from IndexedDB
    } catch (e) { console.warn('[WasmJVM] storage mount failed', e); }
    const flush = () => { try { M.FS.syncfs(false, () => {}); } catch (e) {} };
    if (typeof window !== 'undefined') {
      this._flushTimer = setInterval(flush, storage.flushMs || 4000);
      window.addEventListener('beforeunload', flush);
    }
  }

  /* Persist storage to IndexedDB now. */
  syncStorage() {
    return new Promise((res) => { if (this._persist) this._persist.FS.syncfs(false, res); else res(); });
  }

  /* Create the reusable canvas Screen: size + lay out the canvas, then hand Screen a
   * live module accessor. Screen owns pointer/keyboard events and the frame present
   * loop (Swing/AWT and WebGL apps read /work/ctrl and publish frames). gl mode uses
   * the translator's #glsurface and lets it own drawing (input only, no present loop). */
  _bindCanvas(render) {
    const gl = render.mode === 'gl';
    const cv = gl ? document.getElementById('glsurface') : resolveCanvas(render.canvas);
    if (!gl) { const [w, h] = viewportSize(render); cv.width = w; cv.height = h; applyViewport(cv, render); }
    this._screen = new Screen(cv, {
      getModule:  () => this.module,
      present:    render.present,
      input:      render.input,
      mousemove:  render.mousemove,
      renderLoop: !gl,                        // the GL translator commits its own frames
      onLog:      this.cfg.onStdout || noop,
    }).start();
  }

  /* Inject a raw input event: {type:'key',keyCode,charCode} | {type:'pointer',state,x,y} | {type:'wheel',dy} */
  send(ev) { if (this._screen) this._screen.send(ev); }

  writeFile(path, data) { mkdirp(this.module, path.slice(0, path.lastIndexOf('/'))); this.module.FS.writeFile(path, data); }
  readFile(path, opts)  { return this.module.FS.readFile(path, opts); }

  stop() {
    if (this._screen) this._screen.stop();
    if (this._flushTimer) clearInterval(this._flushTimer);
    try { this.module && this.module.FS.syncfs(false, () => {}); } catch (_) {}
  }
}

// ---- helpers ----------------------------------------------------------------
function noop() {}

function basename(u) { const s = String(u.url || u); return s.slice(s.lastIndexOf('/') + 1) || 'lib.jar'; }
function resolveCanvas(c) {
  if (!c) { const el = document.createElement('canvas'); document.body.appendChild(el); return el; }
  return typeof c === 'string' ? document.querySelector(c) : c;
}
/* Render-buffer size. viewport:'fill' defaults it to the current window. */
function viewportSize(render) {
  const glDef = render.mode === 'gl';
  if (render.viewport === 'fill')
    return [render.width || window.innerWidth, render.height || window.innerHeight];
  return [render.width || (glDef ? 854 : 480), render.height || (glDef ? 480 : 300)];
}
/* Make the canvas occupy the whole browser viewport (viewport:'fill'), or just
 * apply object-fit otherwise. The app owns its internal resolution; object-fit
 * scales that buffer to the viewport ('contain' letterboxes, 'fill' stretches).
 * Uses position:fixed so it tracks window resizes automatically. */
function applyViewport(cv, render) {
  if (render.viewport !== 'fill') {
    if (render.fit !== false) cv.style.objectFit = render.fit || 'contain';
    return;
  }
  const root = document.documentElement, body = document.body;
  root.style.height = '100%'; body.style.margin = '0'; body.style.height = '100%'; body.style.overflow = 'hidden';
  Object.assign(cv.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh', background: '#000',
    objectFit: render.fit === 'fill' ? 'fill' : (render.fit || 'contain'),
  });
}
function mkdirp(M, dir) {
  if (!dir) return; const parts = dir.split('/').filter(Boolean); let p = '';
  for (const s of parts) { p += '/' + s; try { M.FS.mkdir(p); } catch (e) {} }
}

export default WasmJVM;
