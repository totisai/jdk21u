/*
 * A fixed-function / immediate-mode OpenGL 1.x -> WebGL translation layer,
 * written by us (not Emscripten's LEGACY_GL_EMULATION). This is the foundation
 * for rendering Minecraft 1.x, which uses glBegin/glEnd, a matrix stack, etc.
 *
 * PoC scope: immediate-mode triangles (position + colour) through a modern GLES2
 * shader + dynamic VBO, plus a modelview matrix (identity/rotate). Scales to more
 * of GL 1.x by adding state + emu_* entry points, which LWJGL's ngl* natives will
 * later call. GLDemo.java drives it; glReadPixels -> Java byte[] -> canvas blit.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#ifdef WGL_TEST
/* Unit-test build (Node/native): GL + emscripten are mocked so the pure GL1->
 * WebGL translation logic can be exercised without a GPU/context. See test/. */
#include "test/mockgl.h"
#else
#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/html5_webgl.h>
#include <GLES2/gl2.h>
#ifndef WGL_NO_JNI     /* WebGL pixel-test harness includes wgl.c without JNI */
#include <jni.h>
#endif
extern void* emscripten_GetProcAddress(const char* name);
#endif

#ifndef WGL_TEST
EMSCRIPTEN_WEBGL_CONTEXT_HANDLE g_ctx = 0;
#endif
int g_w = 0, g_h = 0;
static GLuint g_prog = 0, g_vbo = 0;
static GLint g_uMV = -1, g_uPR = -1, g_uTex = -1, g_uUseTex = -1, g_uAlphaTest = -1, g_uAlphaRef = -1;
static GLint g_uTex2 = -1, g_uUseTex2 = -1, g_uModColor = -1;
static GLint g_aPos = -1, g_aCol = -1, g_aUV = -1, g_aUV2 = -1;
static float g_modColor[4] = {1,1,1,1};   /* current glColor applied at display-list replay */
static int g_alphaTest = 0; static float g_alphaRef = 0.1f;

/* ============================================================================
 * A small fixed-function OpenGL 1.x state machine translated to GLES2/WebGL.
 * Covers what LWJGL 2 apps (Minecraft and similar) actually use: two matrix
 * stacks (MODELVIEW/PROJECTION), ortho/translate/scale/rotate, immediate mode
 * (glBegin/glColor/glTexCoord/glVertex/glEnd) with GL_TRIANGLES/QUADS/etc, one
 * texture unit, and alpha blending. Everything funnels through one GLES2 shader.
 * Reached via wgl_getproc(): LWJGL's ngl* stubs call these function pointers.
 * ========================================================================== */
#ifndef GL_QUADS
#define GL_QUADS 0x0007
#endif
#define GL_MODELVIEW  0x1700
#define GL_PROJECTION 0x1701
#define GL_TEXTURE    0x1702

/* ---- 4x4 column-major matrix math ---- */
static void mIdentity(float* m) { for (int i = 0; i < 16; i++) m[i] = (i % 5 == 0) ? 1.f : 0.f; }
static void mMul(float* o, const float* a, const float* b) {
    float t[16];
    for (int c = 0; c < 4; c++) for (int r = 0; r < 4; r++) {
        float s = 0; for (int k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
        t[c*4+r] = s;
    }
    memcpy(o, t, sizeof t);
}
static void mRotate(float* m, float deg, float x, float y, float z) {
    float a = deg * 0.01745329252f, c = cosf(a), s = sinf(a);
    float len = sqrtf(x*x + y*y + z*z); if (len > 0) { x/=len; y/=len; z/=len; }
    float r[16]; mIdentity(r);
    r[0]=x*x*(1-c)+c;   r[1]=y*x*(1-c)+z*s; r[2]=x*z*(1-c)-y*s;
    r[4]=x*y*(1-c)-z*s; r[5]=y*y*(1-c)+c;   r[6]=z*y*(1-c)-x*s;
    r[8]=x*z*(1-c)+y*s; r[9]=y*z*(1-c)+x*s; r[10]=z*z*(1-c)+c;
    mMul(m, m, r);
}

/* ---- matrix stacks ---- */
#define STACK_DEPTH 32
static float g_mvStack[STACK_DEPTH][16], g_prStack[STACK_DEPTH][16];
static int g_mvTop = 0, g_prTop = 0;
static int g_matMode = GL_MODELVIEW;
static float* curMat(void) { return g_matMode == GL_PROJECTION ? g_prStack[g_prTop] : g_mvStack[g_mvTop]; }

static void emu_MatrixMode(int m) { g_matMode = m; }
static void emu_LoadIdentity(void) { mIdentity(curMat()); }
static void emu_PushMatrix(void) {
    if (g_matMode == GL_PROJECTION) { if (g_prTop < STACK_DEPTH-1) { memcpy(g_prStack[g_prTop+1], g_prStack[g_prTop], 64); g_prTop++; } }
    else { if (g_mvTop < STACK_DEPTH-1) { memcpy(g_mvStack[g_mvTop+1], g_mvStack[g_mvTop], 64); g_mvTop++; } }
}
static void emu_PopMatrix(void) {
    if (g_matMode == GL_PROJECTION) { if (g_prTop > 0) g_prTop--; } else { if (g_mvTop > 0) g_mvTop--; }
}
static void emu_LoadMatrixf(const float* m) { memcpy(curMat(), m, 64); }
static void emu_MultMatrixf(const float* m) { mMul(curMat(), curMat(), m); }
static void emu_Translatef(float x, float y, float z) {
    float t[16]; mIdentity(t); t[12]=x; t[13]=y; t[14]=z; mMul(curMat(), curMat(), t);
}
static void emu_Scalef(float x, float y, float z) {
    float t[16]; mIdentity(t); t[0]=x; t[5]=y; t[10]=z; mMul(curMat(), curMat(), t);
}
static void emu_Rotatef(float d, float x, float y, float z) { mRotate(curMat(), d, x, y, z); }
static void emu_Ortho(double l, double r, double b, double t, double n, double f) {
    float m[16]; mIdentity(m);
    m[0]=2.f/(r-l); m[5]=2.f/(t-b); m[10]=-2.f/(f-n);
    m[12]=-(r+l)/(r-l); m[13]=-(t+b)/(t-b); m[14]=-(f+n)/(f-n);
    mMul(curMat(), curMat(), m);
}
static void emu_Frustum(double l, double r, double b, double t, double n, double f) {
    float m[16]; memset(m, 0, sizeof m);
    m[0]=(float)(2*n/(r-l)); m[5]=(float)(2*n/(t-b));
    m[8]=(float)((r+l)/(r-l)); m[9]=(float)((t+b)/(t-b)); m[10]=(float)(-(f+n)/(f-n)); m[11]=-1.f;
    m[14]=(float)(-2*f*n/(f-n));
    mMul(curMat(), curMat(), m);
}
/* Double-precision variants — MC uses these for the CAMERA transform (camera
 * position/angles are doubles). Missing them meant glTranslated (the camera
 * translate) was a no-op, so the world rendered off-screen while the sky (drawn
 * camera-relative with glRotatef) still showed. Convert to float and reuse. */
static void emu_Translated(double x, double y, double z) { emu_Translatef((float)x, (float)y, (float)z); }
static void emu_Rotated(double a, double x, double y, double z) { emu_Rotatef((float)a, (float)x, (float)y, (float)z); }
static void emu_Scaled(double x, double y, double z) { emu_Scalef((float)x, (float)y, (float)z); }
static void emu_MultMatrixd(const double* m) { float f[16]; for (int i=0;i<16;i++) f[i]=(float)m[i]; emu_MultMatrixf(f); }
static void emu_LoadMatrixd(const double* m) { float f[16]; for (int i=0;i<16;i++) f[i]=(float)m[i]; emu_LoadMatrixf(f); }

/* ---- immediate mode: interleaved x,y,z, r,g,b,a, u0,v0, u1,v1 (11 floats) ----
 * Two texture units: unit 0 = base (terrain/gui), unit 1 = lightmap. MC modulates
 * base * lightmap * vertexColor. ---- */
#define MAXV 262144
#define VSTRIDE 11
static float g_buf[MAXV * VSTRIDE];
static int g_nv = 0, g_mode = GL_TRIANGLES;
static float g_cr = 1, g_cg = 1, g_cb = 1, g_ca = 1, g_u = 0, g_v = 0, g_u1 = 0, g_v1 = 0;
static int g_texEnabled = 0;   /* GL_TEXTURE_2D on unit 0 */
static int g_tex1En = 0;       /* GL_TEXTURE_2D on unit 1 (lightmap) */
#define GL_TEXTURE0_ 0x84C0
#define GL_TEXTURE1_ 0x84C1
static int g_serverTex = 0;    /* active server texture unit (glActiveTexture) */

static void emu_Begin(int mode) { g_mode = mode; g_nv = 0; }
static void emu_Color4f(float r, float g, float b, float a) { g_cr=r; g_cg=g; g_cb=b; g_ca=a; }
static void emu_Color3f(float r, float g, float b) { emu_Color4f(r,g,b,1.f); }
static void emu_Color4ub(unsigned char r, unsigned char g, unsigned char b, unsigned char a) {
    emu_Color4f(r/255.f, g/255.f, b/255.f, a/255.f);
}
static void emu_TexCoord2f(float u, float v) { g_u=u; g_v=v; }
static void emu_MultiTexCoord2f(GLenum unit, float u, float v) {
    if (unit == GL_TEXTURE1_) { g_u1=u; g_v1=v; } else { g_u=u; g_v=v; }
}
static void emu_Vertex3f(float x, float y, float z) {
    if (g_nv >= MAXV) return;
    float* p = &g_buf[g_nv*VSTRIDE];
    p[0]=x; p[1]=y; p[2]=z; p[3]=g_cr; p[4]=g_cg; p[5]=g_cb; p[6]=g_ca;
    p[7]=g_u; p[8]=g_v; p[9]=g_u1; p[10]=g_v1;
    g_nv++;
}
static void emu_Vertex2f(float x, float y) { emu_Vertex3f(x, y, 0.f); }
static void emu_End(void);

#ifndef WGL_TEST
static const char* VS =
    "attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aUV; attribute vec2 aUV2;"
    "uniform mat4 uMV; uniform mat4 uPR;"
    "varying vec4 vCol; varying vec2 vUV; varying vec2 vUV2;"
    "void main(){ gl_Position = uPR * uMV * vec4(aPos,1.0); vCol = aCol; vUV = aUV; vUV2 = aUV2; }";
static const char* FS =
    "precision mediump float; varying vec4 vCol; varying vec2 vUV; varying vec2 vUV2;"
    "uniform sampler2D uTex; uniform sampler2D uTex2; uniform vec4 uModColor;"
    "uniform int uUseTex; uniform int uUseTex2; uniform int uAlphaTest; uniform float uAlphaRef;"
    "void main(){ vec4 c = vCol * uModColor;"                 /* current glColor (display lists) */
    " if (uUseTex==1)  c *= texture2D(uTex,  vUV);"
    " if (uUseTex2==1) c *= texture2D(uTex2, vUV2);"          /* lightmap modulate */
    " if (uAlphaTest==1 && c.a < uAlphaRef) discard; gl_FragColor = c; }";
static GLuint sh(GLenum t, const char* src) {
    GLuint s = glCreateShader(t); glShaderSource(s, 1, &src, 0); glCompileShader(s);
    GLint ok = 0; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { char l[512]; glGetShaderInfoLog(s, 512, 0, l); printf("[wgl] shader err: %s\n", l); }
    return s;
}
#endif

#ifndef WGL_TEST
/* Exposed C API (used by lwjgl.c's LWJGL backend as well as GLDemo). Creates the
 * WebGL context on `target` (e.g. "#glsurface"), makes it current, and compiles
 * the immediate-mode shader + VBO. Returns 0 on success. */
int wgl_create(const char* target, int w, int h) {
    EmscriptenWebGLContextAttributes a; emscripten_webgl_init_context_attributes(&a);
    a.majorVersion = 2; a.minorVersion = 0; a.alpha = 0; a.depth = 1; a.antialias = 1;
    /* The JVM runs on pthreads (PROXY_TO_PTHREAD) and any Java thread may drive GL,
     * but a DOM canvas lives on the browser main thread. Proxy context creation +
     * GL calls to the main thread (OFFSCREEN_FRAMEBUFFER) so GL works from ANY
     * thread — not just the one a transferred OffscreenCanvas was bound to. */
    a.proxyContextToMainThread = EMSCRIPTEN_WEBGL_CONTEXT_PROXY_ALWAYS;
    a.renderViaOffscreenBackBuffer = 1;
    g_ctx = emscripten_webgl_create_context(target, &a);
    printf("[wgl] create_context(%s) -> handle=%d\n", target, (int)g_ctx);
    if (!g_ctx) { printf("[wgl] FAILED to create WebGL context\n"); return -1; }
    emscripten_webgl_make_context_current(g_ctx);
    /* size the canvas backing store to the app's render size (MC uses 854x480,
     * GLDemo 480x360) so glReadPixels/publish matches and the browser blit is 1:1 */
    emscripten_set_canvas_element_size(target, w, h);
    printf("[wgl] GL_VERSION=%s\n", (const char*)glGetString(GL_VERSION));
    g_w = w; g_h = h; glViewport(0, 0, w, h);
    g_prog = glCreateProgram();
    glAttachShader(g_prog, sh(GL_VERTEX_SHADER, VS));
    glAttachShader(g_prog, sh(GL_FRAGMENT_SHADER, FS));
    glLinkProgram(g_prog);
    GLint ok = 0; glGetProgramiv(g_prog, GL_LINK_STATUS, &ok);
    if (!ok) { printf("[wgl] link failed\n"); return -2; }
    g_uMV = glGetUniformLocation(g_prog, "uMV");
    g_uPR = glGetUniformLocation(g_prog, "uPR");
    g_uTex = glGetUniformLocation(g_prog, "uTex");
    g_uTex2 = glGetUniformLocation(g_prog, "uTex2");
    g_uUseTex = glGetUniformLocation(g_prog, "uUseTex");
    g_uUseTex2 = glGetUniformLocation(g_prog, "uUseTex2");
    g_uModColor = glGetUniformLocation(g_prog, "uModColor");
    g_uAlphaTest = glGetUniformLocation(g_prog, "uAlphaTest");
    g_uAlphaRef = glGetUniformLocation(g_prog, "uAlphaRef");
    g_aPos = glGetAttribLocation(g_prog, "aPos");
    g_aCol = glGetAttribLocation(g_prog, "aCol");
    g_aUV = glGetAttribLocation(g_prog, "aUV");
    g_aUV2 = glGetAttribLocation(g_prog, "aUV2");
    glGenBuffers(1, &g_vbo);
    mIdentity(g_mvStack[0]); mIdentity(g_prStack[0]);
    printf("[wgl] GL1->WebGL translator ready (uMV=%d uPR=%d aPos=%d aCol=%d aUV=%d)\n",
           g_uMV, g_uPR, g_aPos, g_aCol, g_aUV);
    return 0;
}

/* Read the current framebuffer (Y-flipped RGBA) and publish it to /work/frame.bin
 * + bump /work/seq, so the browser rAF loop blits it to the visible <canvas>.
 * Called from LWJGL's Display.update() -> nSwapBuffers. */
void wgl_publish_frame(void) {
    if (!g_ctx || g_w <= 0 || g_h <= 0) return;
    static unsigned char* px = 0; static int cap = 0;
    int need = g_w * g_h * 4;
    if (need > cap) { free(px); px = (unsigned char*)malloc(need); cap = need; }
    if (!px) return;
    glReadPixels(0, 0, g_w, g_h, GL_RGBA, GL_UNSIGNED_BYTE, px);
    int rb = g_w * 4;
    unsigned char* line = (unsigned char*)malloc(rb);
    for (int y = 0; y < g_h/2; y++) {
        unsigned char* a = px + y*rb, *b = px + (g_h-1-y)*rb;
        memcpy(line, a, rb); memcpy(a, b, rb); memcpy(b, line, rb);
    }
    free(line);
    FILE* f = fopen("/work/frame.tmp", "wb");
    if (f) { fwrite(px, 1, need, f); fclose(f); rename("/work/frame.tmp", "/work/frame.bin"); }
    static long seq = 0; seq++;
    f = fopen("/work/seq", "w"); if (f) { fprintf(f, "%ld", seq); fclose(f); }
}

/* Present the rendered frame straight to the (visible) canvas — blit the offscreen
 * backbuffer to the WebGL default framebuffer, no CPU readback. Vastly cheaper than
 * wgl_publish_frame: no 1.6MB glReadPixels sync, no MEMFS copy, no 2D putImageData.
 * Used by LWJGL's Display.update()->nSwapBuffers. We still bump /work/seq (a few
 * bytes) so headless tests can count frames; pixels are read via the canvas. */
void wgl_present(void) {
    if (!g_ctx) return;
    emscripten_webgl_commit_frame();
    static long seq = 0; seq++;
    FILE* f = fopen("/work/seq", "w"); if (f) { fprintf(f, "%ld", seq); fclose(f); }
}
#endif /* !WGL_TEST */

/* ---- draw an interleaved vertex buffer through the shader with current state ---- */
static void emu_draw(const float* rawverts, int rawn, int mode) {
    if (rawn <= 0) return;
    const float* verts = rawverts; int nverts = rawn; int drawMode = mode;
    static float* quad = 0; static int quadCap = 0;
    if (mode == GL_QUADS) {                /* expand quads -> triangles */
        int nq = rawn / 4, need = nq * 6 * VSTRIDE;
        if (need > quadCap) { free(quad); quad = malloc(need * sizeof(float)); quadCap = need; }
        int o = 0;
        for (int q = 0; q < nq; q++) {
            const float* v = &rawverts[q*4*VSTRIDE];
            int idx[6] = {0,1,2, 0,2,3};
            for (int k = 0; k < 6; k++) { memcpy(&quad[o], &v[idx[k]*VSTRIDE], VSTRIDE*sizeof(float)); o += VSTRIDE; }
        }
        verts = quad; nverts = nq * 6; drawMode = GL_TRIANGLES;
    }
    glUseProgram(g_prog);
    glUniformMatrix4fv(g_uMV, 1, GL_FALSE, g_mvStack[g_mvTop]);
    glUniformMatrix4fv(g_uPR, 1, GL_FALSE, g_prStack[g_prTop]);
    glUniform1i(g_uUseTex,  g_texEnabled ? 1 : 0);
    glUniform1i(g_uUseTex2, g_tex1En ? 1 : 0);
    glUniform1i(g_uTex, 0);
    glUniform1i(g_uTex2, 1);
    glUniform1i(g_uAlphaTest, g_alphaTest ? 1 : 0);
    glUniform1f(g_uAlphaRef, g_alphaRef);
    glUniform4f(g_uModColor, g_modColor[0], g_modColor[1], g_modColor[2], g_modColor[3]);
    glBindBuffer(GL_ARRAY_BUFFER, g_vbo);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(nverts * VSTRIDE * sizeof(float)), verts, GL_DYNAMIC_DRAW);
    int st = VSTRIDE * sizeof(float);
    glEnableVertexAttribArray(g_aPos); glVertexAttribPointer(g_aPos, 3, GL_FLOAT, GL_FALSE, st, (void*)0);
    glEnableVertexAttribArray(g_aCol); glVertexAttribPointer(g_aCol, 4, GL_FLOAT, GL_FALSE, st, (void*)(3*sizeof(float)));
    glEnableVertexAttribArray(g_aUV);  glVertexAttribPointer(g_aUV,  2, GL_FLOAT, GL_FALSE, st, (void*)(7*sizeof(float)));
    if (g_aUV2 >= 0) { glEnableVertexAttribArray(g_aUV2); glVertexAttribPointer(g_aUV2, 2, GL_FLOAT, GL_FALSE, st, (void*)(9*sizeof(float))); }
    glDrawArrays(drawMode, 0, nverts);
}

/* ---- display lists: MC 1.x caches chunk geometry in glNewList/glCallList. We
 *      record each primitive's vertices and replay them (with the modelview set
 *      at call time — MC translates to the chunk before glCallList). ---- */
typedef struct { float* verts; int nverts; int mode; } ListCmd;
typedef struct { ListCmd* cmds; int n, cap; } DList;
static DList* g_dlists = 0; static int g_dlistCap = 0;
static int g_nextList = 1, g_compiling = 0, g_listExec = 0, g_listBase = 0;
static DList* dlist(int id) {
    if (id <= 0) return 0;
    if (id >= g_dlistCap) { int nc = id + 4096; g_dlists = realloc(g_dlists, nc*sizeof(DList));
        memset(g_dlists + g_dlistCap, 0, (nc - g_dlistCap)*sizeof(DList)); g_dlistCap = nc; }
    return &g_dlists[id];
}
static void dlist_reset(int id) { DList* L = dlist(id); if (!L) return;
    for (int i = 0; i < L->n; i++) free(L->cmds[i].verts); L->n = 0; }
static void dlist_record(int id, const float* v, int nv, int mode) {
    DList* L = dlist(id); if (!L) return;
    if (L->n >= L->cap) { L->cap = L->cap ? L->cap*2 : 8; L->cmds = realloc(L->cmds, L->cap*sizeof(ListCmd)); }
    ListCmd* c = &L->cmds[L->n++]; c->nverts = nv; c->mode = mode;
    c->verts = malloc((size_t)nv*VSTRIDE*sizeof(float)); memcpy(c->verts, v, (size_t)nv*VSTRIDE*sizeof(float));
}
static int  emu_GenLists(int n)          { int b = g_nextList; if (n > 0) g_nextList += n; return b; }
static void emu_NewList(int id, int mode){ g_compiling = id; g_listExec = (mode == 0x1301); dlist_reset(id); }
static void emu_EndList(void)            { g_compiling = 0; }
static void emu_CallList(int id) { DList* L = dlist(id); if (!L) return;
    /* apply the current glColor while replaying: sky/cloud lists have no per-vertex
     * colour and rely on it; chunk lists have per-vertex colour with a white current
     * colour, so they're unaffected. */
    g_modColor[0]=g_cr; g_modColor[1]=g_cg; g_modColor[2]=g_cb; g_modColor[3]=g_ca;
    for (int i = 0; i < L->n; i++) emu_draw(L->cmds[i].verts, L->cmds[i].nverts, L->cmds[i].mode);
    g_modColor[0]=g_modColor[1]=g_modColor[2]=g_modColor[3]=1.f;
}
static void emu_ListBase(int b)          { g_listBase = b; }
static void emu_DeleteLists(int id, int r){ for (int i = 0; i < r; i++) dlist_reset(id+i); }
static void emu_CallLists(int n, int type, const void* lists) {
    for (int i = 0; i < n; i++) { int id;
        switch (type) { case 0x1401: id = ((const unsigned char*)lists)[i]; break;   /* UBYTE  */
                        case 0x1403: id = ((const unsigned short*)lists)[i]; break;  /* USHORT */
                        default:     id = ((const unsigned int*)lists)[i]; break; }   /* UINT   */
        emu_CallList(g_listBase + id); }
}

/* ---- flush immediate-mode primitive: record into the open list, else draw ---- */
static void emu_End(void) {
    if (g_nv <= 0) return;
    if (g_compiling) { dlist_record(g_compiling, g_buf, g_nv, g_mode);
                       if (g_listExec) emu_draw(g_buf, g_nv, g_mode); }
    else             { emu_draw(g_buf, g_nv, g_mode); }
    g_nv = 0;
}

/* ---- enable/disable: GL_TEXTURE_2D toggles our sampler; only forward caps that
 *      actually exist in GLES2 (else glEnable(GL_ALPHA_TEST/FOG/LIGHTING/...) would
 *      raise GL_INVALID_ENUM, which Minecraft's glGetError checks spam about). ---- */
#define GL_TEXTURE_2D 0x0DE1
#define GL_ALPHA_TEST 0x0BC0
static int emu_realCap(GLenum cap) {
    switch (cap) {
        case 0x0BE2: /*BLEND*/ case 0x0B71: /*DEPTH_TEST*/ case 0x0B44: /*CULL_FACE*/
        case 0x0C11: /*SCISSOR_TEST*/ case 0x0B90: /*STENCIL_TEST*/ case 0x0BD0: /*DITHER*/
        case 0x8037: /*POLYGON_OFFSET_FILL*/ case 0x809E: /*SAMPLE_ALPHA_TO_COVERAGE*/
        case 0x80A0: /*SAMPLE_COVERAGE*/
            return 1;
        default: return 0;   /* legacy fixed-function cap: tracked/ignored, not forwarded */
    }
}
/* GL_TEXTURE_2D is per server texture unit (unit 0 = base, unit 1 = lightmap) */
static void emu_Enable(GLenum cap)  {
    if (cap == GL_TEXTURE_2D) { if (g_serverTex) g_tex1En = 1; else g_texEnabled = 1; }
    else if (cap == GL_ALPHA_TEST) g_alphaTest = 1; else if (emu_realCap(cap)) glEnable(cap);
}
static void emu_Disable(GLenum cap) {
    if (cap == GL_TEXTURE_2D) { if (g_serverTex) g_tex1En = 0; else g_texEnabled = 0; }
    else if (cap == GL_ALPHA_TEST) g_alphaTest = 0; else if (emu_realCap(cap)) glDisable(cap);
}
/* select the active server texture unit for subsequent bind/enable; forward to
 * real GL so glBindTexture binds to the right unit (our shader samples 0 and 1). */
static void emu_ActiveTexture(GLenum unit) { g_serverTex = (unit == GL_TEXTURE1_) ? 1 : 0; glActiveTexture(unit); }

/* ---- client-side vertex arrays (Minecraft's Tessellator: glVertexPointer +
 *      glColorPointer + glTexCoordPointer + glDrawArrays over an interleaved
 *      heap buffer). We read the attributes back and replay them through the
 *      immediate-mode path (which handles matrices, QUADS->tris, texturing). ---- */
#define GL_VERTEX_ARRAY        0x8074
#define GL_NORMAL_ARRAY        0x8075
#define GL_COLOR_ARRAY         0x8076
#define GL_TEXTURE_COORD_ARRAY 0x8078
#define GL_UNSIGNED_BYTE_E     0x1401
#define GL_FLOAT_E             0x1406
typedef struct { int enabled, size, type, stride; const unsigned char* ptr; } VArray;
static VArray g_vaVert, g_vaCol, g_vaTex, g_vaTex2;   /* Tex = unit 0 base, Tex2 = unit 1 lightmap */
static int g_clientTex = 0;   /* client active texture unit (0 or 1) for texcoord arrays */
static void emu_ClientActiveTexture(GLenum unit) { g_clientTex = (unit == GL_TEXTURE1_) ? 1 : 0; }
static void emu_EnableClientState(GLenum a) {
    if (a==GL_VERTEX_ARRAY) g_vaVert.enabled=1; else if (a==GL_COLOR_ARRAY) g_vaCol.enabled=1;
    else if (a==GL_TEXTURE_COORD_ARRAY) { if (g_clientTex) g_vaTex2.enabled=1; else g_vaTex.enabled=1; }
}
static void emu_DisableClientState(GLenum a) {
    if (a==GL_VERTEX_ARRAY) g_vaVert.enabled=0; else if (a==GL_COLOR_ARRAY) g_vaCol.enabled=0;
    else if (a==GL_TEXTURE_COORD_ARRAY) { if (g_clientTex) g_vaTex2.enabled=0; else g_vaTex.enabled=0; }
}
static void emu_VertexPointer(int size,int type,int stride,const void* p){ g_vaVert.size=size; g_vaVert.type=type; g_vaVert.stride=stride?stride:size*4; g_vaVert.ptr=p; }
static void emu_ColorPointer(int size,int type,int stride,const void* p){ g_vaCol.size=size; g_vaCol.type=type; g_vaCol.stride=stride?stride:size*4; g_vaCol.ptr=p; }
static void emu_TexCoordPointer(int size,int type,int stride,const void* p){
    VArray* t = g_clientTex ? &g_vaTex2 : &g_vaTex;
    t->size=size; t->type=type; t->stride=stride?stride:size*4; t->ptr=p; }
static void emu_DrawArrays(int mode,int first,int count){
    if (!g_vaVert.enabled || !g_vaVert.ptr) return;  /* VBO-backed draws not used by MC 1.x */
    emu_Begin(mode);
    for (int i = first; i < first + count; i++) {
        if (g_vaCol.enabled && g_vaCol.ptr) {
            const unsigned char* c = g_vaCol.ptr + (size_t)i * g_vaCol.stride;
            if (g_vaCol.type == GL_UNSIGNED_BYTE_E)
                emu_Color4ub(c[0], c[1], c[2], g_vaCol.size >= 4 ? c[3] : 255);
            else { const float* cf = (const float*)c; emu_Color4f(cf[0], cf[1], cf[2], g_vaCol.size >= 4 ? cf[3] : 1.f); }
        }
        if (g_vaTex.enabled && g_vaTex.ptr) {
            const float* t = (const float*)(g_vaTex.ptr + (size_t)i * g_vaTex.stride);
            emu_TexCoord2f(t[0], t[1]);
        }
        if (g_vaTex2.enabled && g_vaTex2.ptr) {
            const float* t = (const float*)(g_vaTex2.ptr + (size_t)i * g_vaTex2.stride);
            emu_MultiTexCoord2f(GL_TEXTURE1_, t[0], t[1]);
        }
        const float* v = (const float*)(g_vaVert.ptr + (size_t)i * g_vaVert.stride);
        emu_Vertex3f(v[0], v[1], g_vaVert.size >= 3 ? v[2] : 0.f);
    }
    emu_End();
}

/* no-ops: fixed-function state we don't (yet) emulate but must not leave null */
static void emu_ShadeModel(GLenum m) { (void)m; }
static void emu_Normal3f(float a,float b,float c){(void)a;(void)b;(void)c;}
static void emu_AlphaFunc(GLenum f, float r){ (void)f; g_alphaRef = r; }   /* assume GL_GREATER (MC's usage) */
static void emu_TexEnvi(GLenum a,GLenum b,GLint c){(void)a;(void)b;(void)c;}
static void emu_Color3ub(unsigned char r,unsigned char g,unsigned char b){emu_Color4ub(r,g,b,255);}
static void emu_Vertex2i(int x,int y){emu_Vertex3f((float)x,(float)y,0.f);}
static void emu_ClearDepth(double d){ glClearDepthf((float)d); }
static void emu_DepthRange(double n,double f){ glDepthRangef((float)n,(float)f); }
/* glGetIntegerv: answer legacy limits GLES2 lacks (GL_MAX_TEXTURE_UNITS etc. —
 * LWJGL sizes its per-unit client-array state from these; 0 -> a 0-length array
 * and an AIOOBE in glTexCoordPointer). Forward everything else to real GL. */
static void emu_GetIntegerv(GLenum pname, GLint* params) {
    if (!params) return;
    switch (pname) {
        case 0x84E2: /* GL_MAX_TEXTURE_UNITS      */
        case 0x8871: /* GL_MAX_TEXTURE_COORDS     */
        case 0x8872: /* GL_MAX_TEXTURE_IMAGE_UNITS*/
        case 0x8B4D: /* GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS */
            params[0] = 8; return;
        case 0x86A2: /* GL_NUM_COMPRESSED_TEXTURE_FORMATS */
            params[0] = 0; return;
        default: glGetIntegerv(pname, params); return;
    }
}
/* MC checks glGetError after rendering and spams "GL ERROR / Invalid enum" for
 * every fixed-function enum GLES2 rejects (which it harmlessly ignores). Drain the
 * real flag but report GL_NO_ERROR so MC stays quiet. */
static GLenum emu_GetError(void) { glGetError(); return 0; }
/* glHint: GLES2 only knows GL_GENERATE_MIPMAP_HINT; drop the legacy hints
 * (perspective-correction, fog, ...) that would raise GL_INVALID_ENUM. */
static void emu_Hint(GLenum target, GLenum mode) { if (target == 0x8192) glHint(target, mode); }
/* glTexParameteri: map legacy GL_CLAMP wrap -> GL_CLAMP_TO_EDGE and drop the
 * mip-level params GLES2 lacks, so texture setup doesn't error. */
static void emu_TexParameteri(GLenum t, GLenum p, GLint v) {
    if (p == 0x2802 || p == 0x2803) { if (v == 0x2900) v = 0x812F; }   /* WRAP_S/T: GL_CLAMP -> CLAMP_TO_EDGE */
    else if (p == 0x813C || p == 0x813D) return;                       /* TEXTURE_BASE_LEVEL/MAX_LEVEL: unsupported */
    glTexParameteri(t, p, v);
}

/* Typed no-op fallback stubs live in the generated gl_gen.c. Weak default here so
 * the unit-test and pixel-test harnesses (which don't link gl_gen.c) still link. */
__attribute__((weak)) void* wgl_gen_stub(const char* name) { (void)name; return 0; }

/* wgl_getproc: LWJGL's GLContext.ngetFunctionAddress routes here. Return the real
 * GLES2 entry when it exists, else our fixed-function emulation. */
void* wgl_getproc(const char* name) {
    if (!name) return 0;
    /* legacy fixed-function that GLES2 lacks -> our emulation */
    struct { const char* n; void* f; } tbl[] = {
        {"glBegin",(void*)emu_Begin}, {"glEnd",(void*)emu_End},
        {"glVertex2f",(void*)emu_Vertex2f}, {"glVertex3f",(void*)emu_Vertex3f}, {"glVertex2i",(void*)emu_Vertex2i},
        {"glColor3f",(void*)emu_Color3f}, {"glColor4f",(void*)emu_Color4f},
        {"glColor3ub",(void*)emu_Color3ub}, {"glColor4ub",(void*)emu_Color4ub},
        {"glTexCoord2f",(void*)emu_TexCoord2f}, {"glNormal3f",(void*)emu_Normal3f},
        {"glMatrixMode",(void*)emu_MatrixMode}, {"glLoadIdentity",(void*)emu_LoadIdentity},
        {"glPushMatrix",(void*)emu_PushMatrix}, {"glPopMatrix",(void*)emu_PopMatrix},
        {"glLoadMatrixf",(void*)emu_LoadMatrixf}, {"glMultMatrixf",(void*)emu_MultMatrixf},
        {"glTranslatef",(void*)emu_Translatef}, {"glScalef",(void*)emu_Scalef}, {"glRotatef",(void*)emu_Rotatef},
        {"glTranslated",(void*)emu_Translated}, {"glScaled",(void*)emu_Scaled}, {"glRotated",(void*)emu_Rotated},
        {"glMultMatrixd",(void*)emu_MultMatrixd}, {"glLoadMatrixd",(void*)emu_LoadMatrixd},
        {"glOrtho",(void*)emu_Ortho}, {"glFrustum",(void*)emu_Frustum},
        {"glEnable",(void*)emu_Enable}, {"glDisable",(void*)emu_Disable},
        {"glShadeModel",(void*)emu_ShadeModel}, {"glAlphaFunc",(void*)emu_AlphaFunc},
        {"glTexEnvi",(void*)emu_TexEnvi}, {"glTexEnvf",(void*)emu_TexEnvi},
        {"glClearDepth",(void*)emu_ClearDepth}, {"glDepthRange",(void*)emu_DepthRange},
        {"glEnableClientState",(void*)emu_EnableClientState}, {"glDisableClientState",(void*)emu_DisableClientState},
        {"glVertexPointer",(void*)emu_VertexPointer}, {"glColorPointer",(void*)emu_ColorPointer},
        {"glTexCoordPointer",(void*)emu_TexCoordPointer}, {"glDrawArrays",(void*)emu_DrawArrays},
        {"glClientActiveTexture",(void*)emu_ClientActiveTexture},
        {"glClientActiveTextureARB",(void*)emu_ClientActiveTexture},
        {"glActiveTexture",(void*)emu_ActiveTexture}, {"glActiveTextureARB",(void*)emu_ActiveTexture},
        {"glMultiTexCoord2f",(void*)emu_MultiTexCoord2f}, {"glMultiTexCoord2fARB",(void*)emu_MultiTexCoord2f},
        {"glGetIntegerv",(void*)emu_GetIntegerv}, {"glGetError",(void*)emu_GetError},
        {"glHint",(void*)emu_Hint}, {"glTexParameteri",(void*)emu_TexParameteri},
        {"glGenLists",(void*)emu_GenLists}, {"glNewList",(void*)emu_NewList},
        {"glEndList",(void*)emu_EndList}, {"glCallList",(void*)emu_CallList},
        {"glCallLists",(void*)emu_CallLists}, {"glListBase",(void*)emu_ListBase},
        {"glDeleteLists",(void*)emu_DeleteLists},
        {0,0}
    };
    for (int i = 0; tbl[i].n; i++) if (!strcmp(name, tbl[i].n)) return tbl[i].f;
    void* p = emscripten_GetProcAddress(name);
    if (p) return p;
    /* not emulated and not in GLES2 -> a typed no-op stub (generated, gl_gen.c),
     * so LWJGL sees every required GL11 function as present. Real behaviour for
     * these is added incrementally by moving them into the emu table above. */
    /* null (unsupported) for the rest — LWJGL populates its whole function table
     * and marks the extension unsupported when the pointer is null, which is
     * correct: MC must NOT be told these optional extensions exist. (No log.) */
    return wgl_gen_stub(name);
}

#if !defined(WGL_TEST) && !defined(WGL_NO_JNI)
JNIEXPORT jint JNICALL Java_GLDemo_init(JNIEnv* env, jclass cls, jint w, jint h, jstring target) {
    const char* tgt = (*env)->GetStringUTFChars(env, target, 0);
    int r = wgl_create(tgt, w, h);
    (*env)->ReleaseStringUTFChars(env, target, tgt);
    return r;
}

JNIEXPORT void JNICALL Java_GLDemo_frame(JNIEnv* env, jclass cls, jfloat angleDeg) {
    glClearColor(0.10f, 0.11f, 0.16f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    emu_LoadIdentity();
    emu_Rotatef(angleDeg, 0.0f, 0.0f, 1.0f);   /* immediate-mode + matrix, OUR translation */
    emu_Begin(GL_TRIANGLES);
        emu_Color3f(1.0f, 0.35f, 0.35f); emu_Vertex3f( 0.0f,  0.65f, 0.0f);
        emu_Color3f(0.35f, 1.0f, 0.45f); emu_Vertex3f(-0.6f, -0.5f, 0.0f);
        emu_Color3f(0.4f, 0.55f, 1.0f);  emu_Vertex3f( 0.6f, -0.5f, 0.0f);
    emu_End();
    glFinish();
}

JNIEXPORT jint JNICALL Java_GLDemo_read(JNIEnv* env, jclass cls, jbyteArray out) {
    jbyte* buf = (*env)->GetByteArrayElements(env, out, 0);
    glReadPixels(0, 0, g_w, g_h, GL_RGBA, GL_UNSIGNED_BYTE, (void*)buf);
    int rb = g_w * 4; unsigned char* p = (unsigned char*)buf; unsigned char* tmp = malloc(rb);
    for (int y = 0; y < g_h/2; y++) { unsigned char* a=p+y*rb,*b=p+(g_h-1-y)*rb; memcpy(tmp,a,rb);memcpy(a,b,rb);memcpy(b,tmp,rb); }
    free(tmp);
    int mid = ((g_h/2)*g_w + g_w/2)*4;
    jint sample = ((p[mid]&0xff)<<16)|((p[mid+1]&0xff)<<8)|(p[mid+2]&0xff);
    (*env)->ReleaseByteArrayElements(env, out, buf, 0);
    return sample;
}
JNIEXPORT jint JNICALL JNI_OnLoad_wgl(JavaVM* vm, void* r) { return JNI_VERSION_1_8; }
#endif /* !WGL_TEST && !WGL_NO_JNI */
