/* Recording implementations of the mock GLES2/emscripten surface (see mockgl.h). */
#include "mockgl.h"

MockGL g_mock;
void mock_reset(void) { memset(&g_mock, 0, sizeof g_mock); }

void* emscripten_GetProcAddress(const char* name) {
    /* Distinct, stable, non-null address per name (djb2) — represents a real
     * GLES2 entry point. Never collides with wgl.c's emu_* function addresses. */
    unsigned long h = 5381; for (const char* p = name; *p; p++) h = h*33 + (unsigned char)*p;
    return (void*)(uintptr_t)(0xE0000000u | (h & 0x0ffffff0u));
}

void glUseProgram(GLuint p) { (void)p; }
void glBindBuffer(GLenum t, GLuint b) { (void)t; (void)b; }
void glEnableVertexAttribArray(GLuint i) { (void)i; }
void glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean norm, GLsizei stride, const void* ptr) {
    (void)index; (void)size; (void)type; (void)norm; (void)stride; (void)ptr; g_mock.attribPtrCalls++;
}
void glUniformMatrix4fv(GLint loc, GLsizei count, GLboolean transpose, const GLfloat* value) {
    (void)count; (void)transpose;
    if (g_mock.nmats < 16) { g_mock.mats[g_mock.nmats].loc = loc; memcpy(g_mock.mats[g_mock.nmats].m, value, 16*sizeof(float)); g_mock.nmats++; }
}
void glUniform1i(GLint loc, GLint v) {
    if (g_mock.nu1i < 16) { g_mock.u1i[g_mock.nu1i].loc = loc; g_mock.u1i[g_mock.nu1i].val = v; g_mock.nu1i++; }
}
void glUniform1f(GLint loc, GLfloat v) { (void)loc; (void)v; }
void glBufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage) {
    (void)target; (void)usage;
    g_mock.bufSize = size;
    long n = size / (long)sizeof(float);
    if (n > 4096) n = 4096;
    if (data) memcpy(g_mock.bufData, data, n * sizeof(float));
}
void glDrawArrays(GLenum mode, GLint first, GLsizei count) {
    (void)first; g_mock.drawCalls++; g_mock.drawMode = mode; g_mock.drawCount = count;
}
void glEnable(GLenum cap)  { g_mock.enableCalls++;  g_mock.lastEnableCap = cap; }
void glDisable(GLenum cap) { g_mock.disableCalls++; g_mock.lastDisableCap = cap; }
void glClearDepthf(GLfloat d) { (void)d; }
void glDepthRangef(GLfloat n, GLfloat f) { (void)n; (void)f; }
GLenum glGetError(void) { return 0; }
void glGetIntegerv(GLenum p, GLint* v) { (void)p; if (v) v[0] = 8; }
void glHint(GLenum a, GLenum b) { (void)a; (void)b; }
void glTexParameteri(GLenum a, GLenum b, GLint c) { (void)a; (void)b; (void)c; }
void glActiveTexture(GLenum u) { (void)u; }
void glUniform4f(GLint l,GLfloat a,GLfloat b,GLfloat c,GLfloat d){(void)l;(void)a;(void)b;(void)c;(void)d;}
