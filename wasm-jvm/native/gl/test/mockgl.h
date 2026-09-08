/*
 * Mock GLES2 + emscripten surface for unit-testing wgl.c's GL1->WebGL translator
 * without a GPU/WebGL context. The mocks RECORD the GLES2 calls the translator
 * emits, so tests can assert the exact output of a sequence of GL1 calls.
 * Built with -DWGL_TEST; runs under Node (emcc) or natively (cc).
 */
#ifndef MOCKGL_H
#define MOCKGL_H
#include <stdint.h>
#include <string.h>

/* ---- GL types (only what wgl.c's test-compiled paths reference) ---- */
typedef unsigned int   GLenum;
typedef unsigned int   GLuint;
typedef int            GLint;
typedef int            GLsizei;
typedef float          GLfloat;
typedef unsigned char  GLboolean;
typedef unsigned char  GLubyte;
typedef unsigned int   GLbitfield;
typedef long           GLsizeiptr;
typedef char           GLchar;

/* ---- GL enums used by test-compiled code (others are #defined in wgl.c) ---- */
#define GL_FALSE        0
#define GL_TRUE         1
#define GL_FLOAT        0x1406
#define GL_TRIANGLES    0x0004
#define GL_ARRAY_BUFFER 0x8892
#define GL_DYNAMIC_DRAW 0x88E8
#define GL_BLEND        0x0BE2
#define GL_DEPTH_TEST   0x0B71

/* ---- recording of emitted GLES2 calls ---- */
typedef struct {
    int   drawCalls, drawMode, drawCount;
    long  bufSize; float bufData[4096];
    int   enableCalls, lastEnableCap;
    int   disableCalls, lastDisableCap;
    struct { int loc; float m[16]; } mats[16]; int nmats;
    struct { int loc; int val; }     u1i[16];  int nu1i;
    int   attribPtrCalls;
} MockGL;
extern MockGL g_mock;
void mock_reset(void);

/* emscripten shim: pretend every real GL entry resolves to a distinct address */
void* emscripten_GetProcAddress(const char* name);

/* ---- mocked GLES2 entry points wgl.c emits under test ---- */
void glUseProgram(GLuint);
void glUniformMatrix4fv(GLint loc, GLsizei count, GLboolean transpose, const GLfloat* value);
void glUniform1i(GLint loc, GLint v);
void glUniform1f(GLint loc, GLfloat v);
void glUniform4f(GLint,GLfloat,GLfloat,GLfloat,GLfloat);
void glBindBuffer(GLenum, GLuint);
void glBufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage);
void glEnableVertexAttribArray(GLuint);
void glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean norm, GLsizei stride, const void* ptr);
void glDrawArrays(GLenum mode, GLint first, GLsizei count);
void glEnable(GLenum);
void glDisable(GLenum);
void glActiveTexture(GLenum);
void glClearDepthf(GLfloat);
void glDepthRangef(GLfloat, GLfloat);
GLenum glGetError(void);
void glGetIntegerv(GLenum, GLint*);
void glHint(GLenum, GLenum);
void glTexParameteri(GLenum, GLenum, GLint);

#endif
