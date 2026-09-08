/*
 * Standalone WebGL harness for wgl.c — drives our GL1->WebGL translator against a
 * REAL WebGL context (a normal main-thread <canvas id=c>), so a headless browser
 * (Puppeteer + SwiftShader) can assert actual rendered pixels AND capture images.
 *
 * Scenes exercise: clear, QUADS->triangles, vertex positions, per-vertex color,
 * the projection matrix path, texturing, alpha blending, depth testing, rotation
 * animation, and a large batch of primitives (stress).
 *
 * Includes wgl.c directly (WGL_NO_JNI) to reach its static emu_* entry points.
 */
#ifndef WGL_NO_JNI
#define WGL_NO_JNI
#endif
#include "../../wgl.c"

/* extra GLES2 enums used only by the harness (not by the translator) */
#ifndef GL_DEPTH_BUFFER_BIT
#define GL_DEPTH_BUFFER_BIT 0x00000100
#endif
#ifndef GL_DEPTH_TEST
#define GL_DEPTH_TEST 0x0B71
#endif
#ifndef GL_LESS
#define GL_LESS 0x0201
#endif
#ifndef GL_BLEND
#define GL_BLEND 0x0BE2
#endif
#ifndef GL_SRC_ALPHA
#define GL_SRC_ALPHA 0x0302
#endif
#ifndef GL_ONE_MINUS_SRC_ALPHA
#define GL_ONE_MINUS_SRC_ALPHA 0x0303
#endif
#ifndef GL_TEXTURE_MIN_FILTER
#define GL_TEXTURE_MIN_FILTER 0x2801
#define GL_TEXTURE_MAG_FILTER 0x2800
#define GL_NEAREST 0x2600
#endif
extern void glGenTextures(int, unsigned int*);
extern void glBindTexture(unsigned int, unsigned int);
extern void glTexImage2D(unsigned int, int, int, int, int, int, unsigned int, unsigned int, const void*);
extern void glTexParameteri(unsigned int, unsigned int, int);
extern void glBlendFunc(unsigned int, unsigned int);
extern void glDepthFunc(unsigned int);

/* h_init: create the WebGL context on "#c" and set the viewport. */
EMSCRIPTEN_KEEPALIVE int h_init(int w, int h) { return wgl_create("#c", w, h); }

static void quad(float x0, float y0, float x1, float y1, float z) {
    emu_Begin(GL_QUADS);
    emu_Vertex3f(x0, y0, z); emu_Vertex3f(x1, y0, z);
    emu_Vertex3f(x1, y1, z); emu_Vertex3f(x0, y1, z);
    emu_End();
}

/* scene 1: left red / right green split in clip space (identity matrices). */
EMSCRIPTEN_KEEPALIVE void h_scene(void) {
    glClearColor(0.f, 0.f, 1.f, 1.f); glClear(GL_COLOR_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity();
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    g_texEnabled = 0;
    emu_Color3f(1.f, 0.f, 0.f); quad(-1.f, -1.f, 0.f, 1.f, 0.f);
    emu_Color3f(0.f, 1.f, 0.f); quad( 0.f, -1.f, 1.f, 1.f, 0.f);
    glFinish();
}

/* scene 2: ortho-projected magenta quad in the top-right pixel quadrant. */
EMSCRIPTEN_KEEPALIVE void h_scene_ortho(int w, int h) {
    glClearColor(0.f, 0.f, 0.f, 1.f); glClear(GL_COLOR_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity(); emu_Ortho(0, w, 0, h, -1, 1);
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    g_texEnabled = 0;
    emu_Color3f(1.f, 0.f, 1.f); quad(w/2.f, h/2.f, (float)w, (float)h, 0.f);
    glFinish();
}

/* scene 3: a 2x2 texture (red,green / blue,yellow) mapped onto a fullscreen quad. */
static unsigned int g_tex = 0;
EMSCRIPTEN_KEEPALIVE void h_scene_texture(void) {
    if (!g_tex) {
        unsigned char texels[16] = {   /* row0 (v=0): red, green ; row1 (v=1): blue, yellow */
            255,0,0,255,   0,255,0,255,
            0,0,255,255,   255,255,0,255 };
        glGenTextures(1, &g_tex);
        glBindTexture(GL_TEXTURE_2D, g_tex);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 2, 2, 0, GL_RGBA, GL_UNSIGNED_BYTE, texels);
    }
    glClearColor(0.f, 0.f, 0.f, 1.f); glClear(GL_COLOR_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity();
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    glBindTexture(GL_TEXTURE_2D, g_tex);
    emu_Enable(GL_TEXTURE_2D);
    emu_Color4f(1.f, 1.f, 1.f, 1.f);
    emu_Begin(GL_QUADS);
    emu_TexCoord2f(0,0); emu_Vertex3f(-1,-1,0);
    emu_TexCoord2f(1,0); emu_Vertex3f( 1,-1,0);
    emu_TexCoord2f(1,1); emu_Vertex3f( 1, 1,0);
    emu_TexCoord2f(0,1); emu_Vertex3f(-1, 1,0);
    emu_End();
    emu_Disable(GL_TEXTURE_2D);
    glFinish();
}

/* scene 4: alpha blending — opaque red under 50% green -> olive. */
EMSCRIPTEN_KEEPALIVE void h_scene_blend(void) {
    glClearColor(0.f, 0.f, 0.f, 1.f); glClear(GL_COLOR_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity();
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    g_texEnabled = 0;
    emu_Disable(GL_BLEND);
    emu_Color4f(1.f, 0.f, 0.f, 1.f); quad(-1,-1,1,1,0);   /* opaque red */
    emu_Enable(GL_BLEND); glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    emu_Color4f(0.f, 1.f, 0.f, 0.5f); quad(-1,-1,1,1,0);  /* 50% green over */
    emu_Disable(GL_BLEND);
    glFinish();
}

/* scene 5: depth test — near red drawn FIRST, far green after; red must survive
 * (paint order would give green without depth testing). */
EMSCRIPTEN_KEEPALIVE void h_scene_depth(void) {
    glClearColor(0.f, 0.f, 0.f, 1.f); glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity();
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    g_texEnabled = 0;
    emu_Enable(GL_DEPTH_TEST); glDepthFunc(GL_LESS);
    emu_Color3f(1.f, 0.f, 0.f); quad(-1,-1,1,1,-0.5f);   /* near */
    emu_Color3f(0.f, 1.f, 0.f); quad(-1,-1,1,1, 0.5f);   /* far  -> rejected */
    emu_Disable(GL_DEPTH_TEST);
    glFinish();
}

/* animation: a yellow square offset to the right, rotated `deg` about the origin.
 * At 0deg it sits on the right; at 180deg on the left. */
EMSCRIPTEN_KEEPALIVE void h_anim(float deg) {
    glClearColor(0.05f, 0.05f, 0.1f, 1.f); glClear(GL_COLOR_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity();
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    g_texEnabled = 0;
    emu_Rotatef(deg, 0.f, 0.f, 1.f);
    emu_Color3f(1.f, 1.f, 0.f); quad(0.45f, -0.2f, 0.85f, 0.2f, 0.f);
    glFinish();
}

/* stress: a gridxgrid batch of coloured quads in ONE begin/end (grid*grid*4
 * vertices, one draw call). Cell (i,j) colour is deterministic. */
EMSCRIPTEN_KEEPALIVE void h_scene_stress(int grid) {
    glClearColor(0.f, 0.f, 0.f, 1.f); glClear(GL_COLOR_BUFFER_BIT);
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity(); emu_Ortho(0, grid, 0, grid, -1, 1);
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity();
    g_texEnabled = 0;
    emu_Begin(GL_QUADS);
    for (int j = 0; j < grid; j++) for (int i = 0; i < grid; i++) {
        float r = (float)i / grid, g = (float)j / grid, b = 1.f - r;
        emu_Color3f(r, g, b);
        emu_Vertex3f(i,   j,   0); emu_Vertex3f(i+1, j,   0);
        emu_Vertex3f(i+1, j+1, 0); emu_Vertex3f(i,   j+1, 0);
    }
    emu_End();
    glFinish();
}

/* read a single pixel as 0xRRGGBBAA (GL origin: bottom-left). */
EMSCRIPTEN_KEEPALIVE unsigned int h_readpixel(int x, int y) {
    unsigned char p[4] = {0,0,0,0};
    glReadPixels(x, y, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, p);
    return ((unsigned)p[0]<<24) | ((unsigned)p[1]<<16) | ((unsigned)p[2]<<8) | (unsigned)p[3];
}
