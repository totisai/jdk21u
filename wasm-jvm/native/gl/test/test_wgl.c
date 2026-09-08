/*
 * Unit tests for wgl.c — our GL1.x -> WebGL/GLES2 translator.
 *
 * We #include the translator source directly (WGL_TEST build) so tests can both
 * drive its GL1 entry points AND inspect its internal state (matrix stacks,
 * vertex buffer) — white-box. The GLES2 side is mocked (mockgl.c) so we can
 * assert the exact calls the translator emits, with no GPU/context. Runs under
 * Node (emcc) or natively (cc). See run.sh.
 */
#ifndef WGL_TEST
#define WGL_TEST
#endif
#include "../wgl.c"     /* brings in the translator + its statics + mockgl.h */

static int fails = 0, checks = 0;
#define CHECK(cond, msg) do { checks++; if (!(cond)) { fails++; printf("  FAIL: %s (line %d)\n", msg, __LINE__); } } while (0)
#define CHECKF(a, b, msg) CHECK(fabsf((float)(a) - (float)(b)) < 1e-4f, msg)

static void reset_matrices(void) {
    g_mvTop = 0; g_prTop = 0; g_matMode = GL_MODELVIEW; g_texEnabled = 0;
    mIdentity(g_mvStack[0]); mIdentity(g_prStack[0]);
}
static const float* findMat(int loc) {
    for (int i = g_mock.nmats - 1; i >= 0; i--) if (g_mock.mats[i].loc == loc) return g_mock.mats[i].m;
    return 0;
}
static int findU1i(int loc, int fallback) {
    for (int i = g_mock.nu1i - 1; i >= 0; i--) if (g_mock.u1i[i].loc == loc) return g_mock.u1i[i].val;
    return fallback;
}

/* ---- matrix math ---- */
static void test_ortho(void) {
    printf("test_ortho\n");
    reset_matrices();
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity();
    float l=0,r=320,b=240,t=0,n=-1,f=1;
    emu_Ortho(l,r,b,t,n,f);
    const float* m = g_prStack[g_prTop];
    CHECKF(m[0],  2.f/(r-l),        "ortho m0");
    CHECKF(m[5],  2.f/(t-b),        "ortho m5");
    CHECKF(m[10], -2.f/(f-n),       "ortho m10");
    CHECKF(m[12], -(r+l)/(r-l),     "ortho m12");
    CHECKF(m[13], -(t+b)/(t-b),     "ortho m13");
    CHECKF(m[14], -(f+n)/(f-n),     "ortho m14");
    CHECKF(m[15], 1.f,              "ortho m15");
    CHECKF(m[1], 0.f, "ortho m1 zero"); CHECKF(m[4], 0.f, "ortho m4 zero");
}
static void test_translate(void) {
    printf("test_translate\n");
    reset_matrices();
    emu_MatrixMode(GL_MODELVIEW); emu_LoadIdentity();
    emu_Translatef(5.f, 7.f, 9.f);
    const float* m = g_mvStack[g_mvTop];
    CHECKF(m[12], 5.f, "translate x"); CHECKF(m[13], 7.f, "translate y"); CHECKF(m[14], 9.f, "translate z");
    CHECKF(m[0], 1.f, "translate diag0"); CHECKF(m[5], 1.f, "translate diag1"); CHECKF(m[10], 1.f, "translate diag2");
}
static void test_scale(void) {
    printf("test_scale\n");
    reset_matrices();
    emu_MatrixMode(GL_MODELVIEW); emu_LoadIdentity();
    emu_Scalef(2.f, 3.f, 4.f);
    const float* m = g_mvStack[g_mvTop];
    CHECKF(m[0], 2.f, "scale x"); CHECKF(m[5], 3.f, "scale y"); CHECKF(m[10], 4.f, "scale z");
}
static void test_push_pop(void) {
    printf("test_push_pop\n");
    reset_matrices();
    emu_MatrixMode(GL_MODELVIEW); emu_LoadIdentity();
    emu_Translatef(2.f, 0.f, 0.f);
    CHECK(g_mvTop == 0, "top starts 0");
    emu_PushMatrix();
    CHECK(g_mvTop == 1, "push -> top 1");
    emu_Translatef(3.f, 0.f, 0.f);
    CHECKF(g_mvStack[g_mvTop][12], 5.f, "pushed matrix accumulates (2+3)");
    emu_PopMatrix();
    CHECK(g_mvTop == 0, "pop -> top 0");
    CHECKF(g_mvStack[g_mvTop][12], 2.f, "pop restores previous (2)");
}

/* ---- immediate mode ---- */
static void emitQuad(void) {
    emu_Begin(GL_QUADS);
    emu_Color4f(1,0,0,1); emu_TexCoord2f(0,0); emu_Vertex3f(0,0,0);
    emu_Color4f(0,1,0,1); emu_TexCoord2f(1,0); emu_Vertex3f(1,0,0);
    emu_Color4f(0,0,1,1); emu_TexCoord2f(1,1); emu_Vertex3f(1,1,0);
    emu_Color4f(1,1,0,1); emu_TexCoord2f(0,1); emu_Vertex3f(0,1,0);
    emu_End();
}
static void test_quad_expansion(void) {
    printf("test_quad_expansion\n");
    reset_matrices(); mock_reset();
    emitQuad();
    CHECK(g_mock.drawCalls == 1, "one draw call");
    CHECK(g_mock.drawMode == GL_TRIANGLES, "QUADS -> TRIANGLES");
    CHECK(g_mock.drawCount == 6, "4-vertex quad -> 6 triangle vertices");
    /* triangle fan order [0,1,2, 0,2,3]: output vertex 3 == input vertex 0 (pos 0,0,0) */
    const float* v3 = &g_mock.bufData[3 * VSTRIDE];
    CHECKF(v3[0], 0.f, "expanded v3 == input v0 (x)"); CHECKF(v3[1], 0.f, "expanded v3 == input v0 (y)");
    /* output vertex 4 == input vertex 2 (pos 1,1,0) */
    const float* v4 = &g_mock.bufData[4 * VSTRIDE];
    CHECKF(v4[0], 1.f, "expanded v4 == input v2 (x)"); CHECKF(v4[1], 1.f, "expanded v4 == input v2 (y)");
}
static void test_triangles_passthrough(void) {
    printf("test_triangles_passthrough\n");
    reset_matrices(); mock_reset();
    emu_Begin(GL_TRIANGLES);
    emu_Vertex3f(0,0,0); emu_Vertex3f(1,0,0); emu_Vertex3f(0,1,0);
    emu_End();
    CHECK(g_mock.drawMode == GL_TRIANGLES, "triangles stay triangles");
    CHECK(g_mock.drawCount == 3, "3 vertices");
}
static void test_vertex_packing(void) {
    printf("test_vertex_packing\n");
    reset_matrices(); mock_reset();
    emu_Begin(GL_TRIANGLES);
    emu_Color4f(0.2f, 0.4f, 0.6f, 0.8f); emu_TexCoord2f(0.25f, 0.75f); emu_Vertex3f(1.f, 2.f, 3.f);
    emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0);   /* pad to a full triangle */
    emu_End();
    const float* v = g_mock.bufData;  /* x,y,z, r,g,b,a, u,v */
    CHECKF(v[0],1.f,"pack x"); CHECKF(v[1],2.f,"pack y"); CHECKF(v[2],3.f,"pack z");
    CHECKF(v[3],0.2f,"pack r"); CHECKF(v[4],0.4f,"pack g"); CHECKF(v[5],0.6f,"pack b"); CHECKF(v[6],0.8f,"pack a");
    CHECKF(v[7],0.25f,"pack u"); CHECKF(v[8],0.75f,"pack v");
}
static void test_color_ub(void) {
    printf("test_color_ub\n");
    reset_matrices(); mock_reset();
    emu_Begin(GL_TRIANGLES);
    emu_Color4ub(255, 128, 0, 255); emu_Vertex3f(0,0,0);
    emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0);
    emu_End();
    const float* v = g_mock.bufData;
    CHECKF(v[3], 1.f, "ub->f r=255->1"); CHECKF(v[4], 128.f/255.f, "ub->f g=128"); CHECKF(v[5], 0.f, "ub->f b=0");
}

/* ---- texture-enable state -> shader uniform ---- */
static void test_texture_uniform(void) {
    printf("test_texture_uniform\n");
    reset_matrices();
    mock_reset();
    emu_Enable(GL_TEXTURE_2D);
    CHECK(g_texEnabled == 1, "glEnable(GL_TEXTURE_2D) sets state");
    emu_Begin(GL_TRIANGLES); emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0); emu_End();
    CHECK(findU1i(g_uUseTex, -1) == 1, "uUseTex=1 when textured");

    mock_reset();
    emu_Disable(GL_TEXTURE_2D);
    CHECK(g_texEnabled == 0, "glDisable(GL_TEXTURE_2D) clears state");
    emu_Begin(GL_TRIANGLES); emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0); emu_End();
    CHECK(findU1i(g_uUseTex, -1) == 0, "uUseTex=0 when untextured");
}
static void test_enable_forward(void) {
    printf("test_enable_forward\n");
    reset_matrices(); mock_reset();
    emu_Enable(GL_BLEND);
    CHECK(g_mock.enableCalls == 1, "GL_BLEND forwarded to real glEnable");
    CHECK(g_mock.lastEnableCap == GL_BLEND, "forwarded cap is GL_BLEND");
    CHECK(g_texEnabled == 0, "GL_BLEND does not touch texture state");
    emu_Disable(GL_DEPTH_TEST);
    CHECK(g_mock.disableCalls == 1 && g_mock.lastDisableCap == GL_DEPTH_TEST, "GL_DEPTH_TEST forwarded to glDisable");
}

/* ---- matrix uniforms uploaded on draw ---- */
static void test_matrix_upload(void) {
    printf("test_matrix_upload\n");
    reset_matrices(); mock_reset();
    emu_MatrixMode(GL_PROJECTION); emu_LoadIdentity(); emu_Ortho(0,320,240,0,-1,1);
    emu_MatrixMode(GL_MODELVIEW);  emu_LoadIdentity(); emu_Translatef(10,20,0);
    emu_Begin(GL_TRIANGLES); emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0); emu_Vertex3f(0,0,0); emu_End();
    const float* mv = findMat(g_uMV); const float* pr = findMat(g_uPR);
    CHECK(mv != 0, "modelview uploaded to uMV");
    CHECK(pr != 0, "projection uploaded to uPR");
    if (mv) { CHECKF(mv[12], 10.f, "uploaded modelview translate x"); CHECKF(mv[13], 20.f, "uploaded modelview translate y"); }
    if (pr) { CHECKF(pr[0], 2.f/320.f, "uploaded projection ortho m0"); }
}

/* ---- getFunctionAddress routing ---- */
static void test_getproc(void) {
    printf("test_getproc\n");
    CHECK(wgl_getproc("glBegin")      == (void*)emu_Begin,      "glBegin -> emu_Begin");
    CHECK(wgl_getproc("glEnd")        == (void*)emu_End,        "glEnd -> emu_End");
    CHECK(wgl_getproc("glVertex3f")   == (void*)emu_Vertex3f,   "glVertex3f -> emu_Vertex3f");
    CHECK(wgl_getproc("glMatrixMode") == (void*)emu_MatrixMode, "glMatrixMode -> emu_MatrixMode");
    CHECK(wgl_getproc("glTranslatef") == (void*)emu_Translatef, "glTranslatef -> emu_Translatef");
    CHECK(wgl_getproc("glOrtho")      == (void*)emu_Ortho,      "glOrtho -> emu_Ortho");
    CHECK(wgl_getproc("glEnable")     == (void*)emu_Enable,     "glEnable -> emu_Enable (intercepted)");
    /* real GLES2 entry -> emscripten address, distinct from our emulation, stable */
    void* clr = wgl_getproc("glClear");
    CHECK(clr != 0, "glClear resolves");
    CHECK(clr != (void*)emu_Begin, "glClear not an emu function");
    CHECK(clr == wgl_getproc("glClear"), "glClear resolution is stable");
    CHECK(wgl_getproc("glDrawArrays") == wgl_getproc("glDrawArrays"), "glDrawArrays stable (real)");
    CHECK(wgl_getproc(0) == 0, "null name -> null");
}

/* ---- display lists (MC caches chunk geometry here) ---- */
static void test_display_list(void) {
    printf("test_display_list\n");
    reset_matrices(); mock_reset();
    int id = emu_GenLists(1);
    CHECK(id > 0, "glGenLists returns a valid id");
    emu_NewList(id, 0x1300);                 /* GL_COMPILE */
    emu_Begin(GL_TRIANGLES);
    emu_Color4f(1,0,0,1); emu_Vertex3f(0,0,0); emu_Vertex3f(1,0,0); emu_Vertex3f(0,1,0);
    emu_End();
    emu_EndList();
    CHECK(g_mock.drawCalls == 0, "GL_COMPILE records but does NOT draw");
    emu_CallList(id);
    CHECK(g_mock.drawCalls == 1, "glCallList replays the recorded primitive");
    CHECK(g_mock.drawMode == GL_TRIANGLES && g_mock.drawCount == 3, "replayed a 3-vertex triangle");
    emu_CallList(id);
    CHECK(g_mock.drawCalls == 2, "glCallList replays again (list persists)");
}

int main(void) {
    g_uMV = 10; g_uPR = 11; g_uUseTex = 12; g_uTex = 13;  /* deterministic uniform locations */
    printf("== wgl.c GL1->WebGL translator unit tests ==\n");
    test_ortho(); test_translate(); test_scale(); test_push_pop();
    test_quad_expansion(); test_triangles_passthrough(); test_vertex_packing(); test_color_ub();
    test_texture_uniform(); test_enable_forward(); test_matrix_upload();
    test_display_list();
    test_getproc();
    printf("\n%d checks, %d failures\n", checks, fails);
    printf(fails == 0 ? "PASS\n" : "FAIL\n");
    return fails == 0 ? 0 : 1;
}
