/*
 * The "lwjgl" native library for the wasm JVM: LWJGL 2's Linux (X11/GLX) native
 * backend, reimplemented against Emscripten/WebGL + our GL1->WebGL translator
 * (wgl.c). Unmodified stock lwjgl.jar runs on top of this.
 *
 * Key insight that makes this tractable and general: LWJGL treats every native
 * handle as OPAQUE — the XEvent buffer, the peer-info handle, the context handle
 * are only ever touched through native accessors that are ALSO ours. So we own
 * every format and never reproduce real X11 struct layouts; we just implement
 * LWJGL's display/event/context abstraction with our own backing.
 *
 * The GL entry points (glClear, glBegin, ...) are dispatched by the generated
 * gl_gen.c (nglXxx wrappers) which call through function pointers we hand back
 * from GLContext.ngetFunctionAddress -> wgl_getproc (wgl.c).
 *
 * Implemented incrementally; browser-in-the-loop. Stage A: get past
 * Display.create() to the render loop + clear the canvas.
 */
#include <jni.h>
#include <emscripten/html5.h>
#include <emscripten/html5_webgl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---- exposed by wgl.c ---- */
extern EMSCRIPTEN_WEBGL_CONTEXT_HANDLE g_ctx;
extern int g_w, g_h;
extern int   wgl_create(const char* target, int w, int h);
extern void  wgl_publish_frame(void);
extern void  wgl_present(void);
extern void* wgl_getproc(const char* name);

#define TRACE(...) do { printf("[lwjgl] " __VA_ARGS__); printf("\n"); fflush(stdout); } while(0)

/* fake X11 handles (any non-zero, distinct values) */
#define FAKE_DISPLAY ((jlong)0x1001)
#define FAKE_ROOT    ((jlong)0x2001)
#define FAKE_WINDOW  ((jlong)0x3001)
static int g_win_w = 854, g_win_h = 480;   /* updated from the DisplayMode at create */
static int g_mouse_x = 0, g_mouse_y = 0;    /* last pointer position (X11 top-left coords) */

JNIEXPORT jint JNICALL JNI_OnLoad_lwjgl(JavaVM* vm, void* reserved) { return JNI_VERSION_1_8; }

/* ======================= org.lwjgl.DefaultSysImplementation =============== */
JNIEXPORT jint JNICALL Java_org_lwjgl_DefaultSysImplementation_getJNIVersion(JNIEnv* e, jobject o) { return 19; }
JNIEXPORT jint JNICALL Java_org_lwjgl_DefaultSysImplementation_getPointerSize(JNIEnv* e, jobject o) { return (jint) sizeof(void*); }
JNIEXPORT void JNICALL Java_org_lwjgl_DefaultSysImplementation_setDebug(JNIEnv* e, jobject o, jboolean d) {}

/* ============================ org.lwjgl.BufferUtils ======================= */
JNIEXPORT jlong JNICALL Java_org_lwjgl_BufferUtils_getBufferAddress(JNIEnv* e, jclass c, jobject buf) {
    return (jlong)(intptr_t)(*e)->GetDirectBufferAddress(e, buf);
}
JNIEXPORT void JNICALL Java_org_lwjgl_BufferUtils_zeroBuffer0(JNIEnv* e, jclass c, jobject buf, jlong off, jlong size) {
    char* a = (char*)(*e)->GetDirectBufferAddress(e, buf);
    if (a) memset(a + off, 0, (size_t)size);
}

/* ========================== org.lwjgl.opengl.GLContext ==================== */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_GLContext_ngetFunctionAddress(JNIEnv* e, jclass c, jlong name) {
    return (jlong)(intptr_t) wgl_getproc((const char*)(intptr_t) name);
}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_GLContext_nLoadOpenGLLibrary(JNIEnv* e, jclass c) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_GLContext_nUnloadOpenGLLibrary(JNIEnv* e, jclass c) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_GLContext_resetNativeStubs(JNIEnv* e, jclass c, jobject cls) {}

/* glGetString returns a java.lang.String (not primitive) -> hand-written.
 * gl_gen.c skips it. */
JNIEXPORT jstring JNICALL Java_org_lwjgl_opengl_GL11_nglGetString(JNIEnv* e, jclass c, jint name, jlong fp) {
    /* Spoof VERSION/EXTENSIONS: our WebGL context reports "OpenGL ES 2.0 (WebGL
     * ...)", which LWJGL (a desktop-GL library) can't parse as >=1.3, so it skips
     * loading GL12-15 and MC crashes calling e.g. GL13.glClientActiveTexture
     * (pointer 0). Report desktop GL 1.5 so LWJGL loads GL11-15 (backed by our
     * translator/stubs) and takes MC's fixed-function path (no FBO/shaders).
     * Advertise the ARB/EXT extensions MC 1.2.5 probes. */
    if (name == 0x1F02)   /* GL_VERSION */
        return (*e)->NewStringUTF(e, "1.5.0 wasm-GL1->WebGL");
    if (name == 0x1F03)   /* GL_EXTENSIONS */
        return (*e)->NewStringUTF(e,
            "GL_ARB_multitexture GL_ARB_texture_env_combine GL_EXT_texture_env_combine "
            "GL_ARB_vertex_buffer_object GL_ARB_texture_non_power_of_two "
            "GL_EXT_blend_func_separate GL_EXT_texture_env_combine GL_ARB_texture_compression");
    const char* s = ((const char*(*)(int))(intptr_t)fp)((int)name);
    return (*e)->NewStringUTF(e, s ? s : "");
}

/* ======================== org.lwjgl.opengl.LinuxEvent ===================== *
 * We define our own opaque event record and its accessors. (Stage A: the queue
 * is empty; the accessors exist so nothing is unresolved. Input = Stage C.) */
typedef struct {
    int type; jlong window; jlong time;
    int x, y, xroot, yroot; int state; int button; int keycode;
    jlong client_type; int client_data[5]; int client_format;
    int focus_mode, focus_detail; jlong key_address;
} WEvent;

static WEvent* evt(JNIEnv* e, jobject buf) { return (WEvent*)(*e)->GetDirectBufferAddress(e, buf); }

/* ---- browser input -> LWJGL X11-style event queue ----
 * The page appends input lines to /work/ctrl ("seq state x y"): state 1=down,
 * 2=drag, 3=up, 5=wheel(y=delta), 6=move, 4=key(x=keyCode,y=charCode). We drain
 * new lines and translate them into X events (ButtonPress/Release/MotionNotify)
 * that LinuxMouse.filterEvent consumes. Coords are canvas pixels (top-left, y
 * down) = X11 window coords; LWJGL flips Y itself (transformY). */
enum { X_KeyPress=2, X_KeyRelease=3, X_ButtonPress=4, X_ButtonRelease=5, X_MotionNotify=6, X_FocusIn=9, X_FocusOut=10 };
#define EVQ_SIZE 1024
static WEvent g_evq[EVQ_SIZE];
static int g_evq_head = 0, g_evq_tail = 0;
static long g_ctrl_pos = 0;
static jlong g_evt_time = 1;

static void evq_push(int type, int button, int keycode, int x, int y) {
    int n = (g_evq_tail + 1) % EVQ_SIZE;
    if (n == g_evq_head) return;                 /* full: drop */
    WEvent* ev = &g_evq[g_evq_tail];
    memset(ev, 0, sizeof *ev);
    ev->type = type; ev->window = FAKE_WINDOW; ev->time = g_evt_time++;
    ev->button = button; ev->keycode = keycode;
    ev->x = x; ev->y = y; ev->xroot = x; ev->yroot = y;
    g_evq_tail = n;
    if (type == X_MotionNotify || type == X_ButtonPress || type == X_ButtonRelease) { g_mouse_x = x; g_mouse_y = y; }
}
static void drain_ctrl(void) {
    FILE* f = fopen("/work/ctrl", "rb");
    if (!f) return;
    fseek(f, 0, SEEK_END);
    long end = ftell(f);
    if (end < g_ctrl_pos) g_ctrl_pos = 0;        /* file reset */
    long avail = end - g_ctrl_pos;
    if (avail <= 0) { fclose(f); return; }
    char* buf = (char*)malloc(avail + 1);
    if (!buf) { fclose(f); return; }
    fseek(f, g_ctrl_pos, SEEK_SET);
    long got = fread(buf, 1, avail, f);
    fclose(f);
    buf[got] = 0;
    long consumed = 0; char* p = buf; char* nl;
    while ((nl = strchr(p, '\n')) != 0) {
        *nl = 0;
        long seq; int state = 0, x = 0, y = 0;
        if (sscanf(p, "%ld %d %d %d", &seq, &state, &x, &y) == 4) {
            switch (state) {
                case 1: evq_push(X_ButtonPress,   1, 0, x, y); break;   /* left down */
                case 2: evq_push(X_MotionNotify,  0, 0, x, y); break;   /* drag */
                case 3: evq_push(X_ButtonRelease, 1, 0, x, y); break;   /* left up */
                case 6: evq_push(X_MotionNotify,  0, 0, x, y); break;   /* move */
                case 5: { int b = (y < 0) ? 4 : 5;                     /* wheel: y=delta */
                          evq_push(X_ButtonPress,   b, 0, g_mouse_x, g_mouse_y);
                          evq_push(X_ButtonRelease, b, 0, g_mouse_x, g_mouse_y); } break;
                case 4: evq_push(X_KeyPress, 0, x, g_mouse_x, g_mouse_y);   /* key: x=keyCode */
                        evq_push(X_KeyRelease, 0, x, g_mouse_x, g_mouse_y); break;
            }
        }
        consumed = (nl - buf) + 1; p = nl + 1;
    }
    g_ctrl_pos += consumed;
    free(buf);
}

JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxEvent_createEventBuffer(JNIEnv* e, jclass c) {
    WEvent* w = (WEvent*)calloc(1, sizeof(WEvent));
    return (*e)->NewDirectByteBuffer(e, w, sizeof(WEvent));
}
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_getPending(JNIEnv* e, jclass c, jlong display) {
    drain_ctrl();
    return (g_evq_tail - g_evq_head + EVQ_SIZE) % EVQ_SIZE;
}
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nNextEvent(JNIEnv* e, jclass c, jlong display, jobject buf) {
    WEvent* out = evt(e, buf);
    if (!out) return;
    if (g_evq_head == g_evq_tail) { memset(out, 0, sizeof *out); return; }
    *out = g_evq[g_evq_head];
    g_evq_head = (g_evq_head + 1) % EVQ_SIZE;
}
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxEvent_nFilterEvent(JNIEnv* e, jclass c, jobject buf, jlong window) { return JNI_FALSE; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nSendEvent(JNIEnv* e, jclass c, jobject buf, jlong display, jlong window, jboolean prop, jlong mask) {}
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetType(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->type; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetWindow(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->window; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nSetWindow(JNIEnv* e, jclass c, jobject b, jlong w) { evt(e,b)->window = w; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetFocusMode(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->focus_mode; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetFocusDetail(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->focus_detail; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetClientMessageType(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->client_type; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetClientData(JNIEnv* e, jclass c, jobject b, jint i) { return evt(e,b)->client_data[i & 3]; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetClientFormat(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->client_format; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonTime(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->time; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonState(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->state; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonType(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->type; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonButton(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->button; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonRoot(JNIEnv* e, jclass c, jobject b) { return FAKE_ROOT; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonXRoot(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->xroot; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonYRoot(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->yroot; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonX(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->x; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetButtonY(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->y; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetKeyAddress(JNIEnv* e, jclass c, jobject b) { return (jlong)(intptr_t) evt(e,b); }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetKeyTime(JNIEnv* e, jclass c, jobject b) { return (jint) evt(e,b)->time; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetKeyType(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->type; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetKeyKeyCode(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->keycode; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxEvent_nGetKeyState(JNIEnv* e, jclass c, jobject b) { return evt(e,b)->state; }

/* ======================== org.lwjgl.opengl.LinuxDisplay ==================== */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_openDisplay(JNIEnv* e, jclass c) { TRACE("openDisplay"); return FAKE_DISPLAY; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_closeDisplay(JNIEnv* e, jclass c, jlong d) {}
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetDefaultScreen(JNIEnv* e, jclass c, jlong d) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_getRootWindow(JNIEnv* e, jclass c, jlong d, jint s) { return FAKE_ROOT; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nLockAWT(JNIEnv* e, jclass c) {}
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nUnlockAWT(JNIEnv* e, jclass c) {}
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_synchronize(JNIEnv* e, jclass c, jlong d, jboolean s) {}
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_setErrorHandler(JNIEnv* e, jclass c) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_resetErrorHandler(JNIEnv* e, jclass c, jlong h) { return 0; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_callErrorHandler(JNIEnv* e, jclass c, jlong h, jlong d, jlong err) { return 0; }
JNIEXPORT jstring JNICALL Java_org_lwjgl_opengl_LinuxDisplay_getErrorText(JNIEnv* e, jclass c, jlong d, jlong code) { return (*e)->NewStringUTF(e, "no error"); }

/* display mode extension: report XF86VidMode (simplest init() path), not XRandR */
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nIsXrandrSupported(JNIEnv* e, jclass c, jlong d) { return JNI_FALSE; }
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nIsXF86VidModeSupported(JNIEnv* e, jclass c, jlong d) { return JNI_TRUE; }
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nIsNetWMFullscreenSupported(JNIEnv* e, jclass c, jlong d, jint s) { return JNI_FALSE; }

static jobject makeDisplayMode(JNIEnv* e, int w, int h, int bpp, int freq) {
    jclass cls = (*e)->FindClass(e, "org/lwjgl/opengl/DisplayMode");
    jmethodID ctor = (*e)->GetMethodID(e, cls, "<init>", "(IIII)V");
    return (*e)->NewObject(e, cls, ctor, w, h, bpp, freq);
}
JNIEXPORT jobjectArray JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetAvailableDisplayModes(JNIEnv* e, jclass c, jlong d, jint s, jint ext) {
    jclass cls = (*e)->FindClass(e, "org/lwjgl/opengl/DisplayMode");
    jobjectArray arr = (*e)->NewObjectArray(e, 1, cls, 0);
    (*e)->SetObjectArrayElement(e, arr, 0, makeDisplayMode(e, 1280, 720, 32, 60));
    return arr;
}
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetCurrentXRandrMode(JNIEnv* e, jclass c, jlong d, jint s) {
    return makeDisplayMode(e, 1280, 720, 32, 60);
}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSwitchDisplayMode(JNIEnv* e, jclass c, jlong d, jint s, jint ext, jobject mode) {}

/* gamma: return a plausible ramp so init() doesn't choke */
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetGammaRampLength(JNIEnv* e, jclass c, jlong d, jint s) { return 256; }
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetCurrentGammaRamp(JNIEnv* e, jclass c, jlong d, jint s) {
    int n = 256 * 3; unsigned short* r = (unsigned short*)calloc(n, sizeof(unsigned short));
    for (int i = 0; i < 256; i++) { unsigned short v = (unsigned short)(i * 257); r[i]=v; r[256+i]=v; r[512+i]=v; }
    return (*e)->NewDirectByteBuffer(e, r, n * (jlong)sizeof(unsigned short));
}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetGammaRamp(JNIEnv* e, jclass c, jlong d, jint s, jobject ramp) {}
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nConvertToNativeRamp(JNIEnv* e, jclass c, jobject ramp, jint off, jint len) {
    return (*e)->NewDirectByteBuffer(e, calloc(len ? len : 1, sizeof(unsigned short)), (len ? len : 1) * (jlong)sizeof(unsigned short));
}

/* atoms: hand back a stable non-zero id per name */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nInternAtom(JNIEnv* e, jclass c, jlong d, jstring name, jboolean only_if_exists) {
    /* X11 semantics: only_if_exists=true returns None(0) when the atom doesn't
     * exist. We have no real atoms, so query-only interns return None; this makes
     * optional-feature probes (e.g. _XEMBED_INFO in isAncestorXEmbedded) resolve
     * cleanly instead of looping. Create interns (only_if_exists=false) get a
     * stable non-zero id. */
    if (only_if_exists) return 0;
    const char* s = (*e)->GetStringUTFChars(e, name, 0);
    unsigned long h = 5381; for (const char* p = s; *p; p++) h = h*33 + (unsigned char)*p;
    (*e)->ReleaseStringUTFChars(e, name, s);
    return (jlong)(0x40000000u | (h & 0x3fffffff));
}
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxDisplay_hasProperty(JNIEnv* e, jclass c, jlong d, jlong w, jlong prop) { return JNI_FALSE; }
/* window tree: our window's parent is the root; the root has NO parent (0), so
 * tree walks (isAncestorXEmbedded) terminate. */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_getParentWindow(JNIEnv* e, jclass c, jlong d, jlong w) { return w == FAKE_ROOT ? 0 : FAKE_ROOT; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_getChildCount(JNIEnv* e, jclass c, jlong d, jlong w) { return 0; }

/* window lifecycle */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nCreateWindow(JNIEnv* e, jclass c, jlong d, jint s, jobject peer, jobject mode, jint window_mode, jint x, jint y, jboolean undecorated, jlong parent, jboolean resizable) {
    if (mode) {
        jclass mc = (*e)->GetObjectClass(e, mode);
        jfieldID fw = (*e)->GetFieldID(e, mc, "width", "I");
        jfieldID fh = (*e)->GetFieldID(e, mc, "height", "I");
        if (fw && fh) { g_win_w = (*e)->GetIntField(e, mode, fw); g_win_h = (*e)->GetIntField(e, mode, fh); }
        (*e)->ExceptionClear(e);
    }
    TRACE("nCreateWindow %dx%d mode=%d", g_win_w, g_win_h, window_mode);
    /* tell LWJGL the window is focused so Display.isActive() is true — otherwise MC
     * thinks it lost focus and keeps opening the pause menu. (FocusIn, NotifyNormal) */
    evq_push(X_FocusIn, 0, 0, 0, 0);
    return FAKE_WINDOW;
}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nDestroyWindow(JNIEnv* e, jclass c, jlong d, jlong w) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_mapRaised(JNIEnv* e, jclass c, jlong d, jlong w) { TRACE("mapRaised"); }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_reparentWindow(JNIEnv* e, jclass c, jlong d, jlong w, jlong parent, jint x, jint y) {}
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetInputFocus(JNIEnv* e, jclass c, jlong d) { return FAKE_WINDOW; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetInputFocus(JNIEnv* e, jclass c, jlong d, jlong w, jlong time) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetWindowSize(JNIEnv* e, jclass c, jlong d, jlong w, jint width, jint height, jboolean resizable) { g_win_w=width; g_win_h=height; }
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetX(JNIEnv* e, jclass c, jlong d, jlong w) { return 0; }
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetY(JNIEnv* e, jclass c, jlong d, jlong w) { return 0; }
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetWidth(JNIEnv* e, jclass c, jlong d, jlong w) { return g_win_w; }
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetHeight(JNIEnv* e, jclass c, jlong d, jlong w) { return g_win_h; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nReshape(JNIEnv* e, jclass c, jlong d, jlong w, jint x, jint y, jint width, jint height) { g_win_w=width; g_win_h=height; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetViewPort(JNIEnv* e, jclass c, jlong d, jlong w, jint s) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetTitle(JNIEnv* e, jclass c, jlong d, jlong w, jlong title, jint len) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetClassHint(JNIEnv* e, jclass c, jlong d, jlong w, jlong wm_name, jlong wm_class) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSync(JNIEnv* e, jclass c, jlong d, jboolean throw_away) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nIconifyWindow(JNIEnv* e, jclass c, jlong d, jlong w, jint s) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nSetWindowIcon(JNIEnv* e, jclass c, jlong d, jlong w, jobject icons, jint size) {}

/* input grabs / cursor: no-ops in a browser */
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGrabKeyboard(JNIEnv* e, jclass c, jlong d, jlong w) { return 0; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nUngrabKeyboard(JNIEnv* e, jclass c, jlong d) { return 0; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGrabPointer(JNIEnv* e, jclass c, jlong d, jlong w, jlong cur) { return 0; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nUngrabPointer(JNIEnv* e, jclass c, jlong d) { return 0; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nDefineCursor(JNIEnv* e, jclass c, jlong d, jlong w, jlong cur) {}
/* report 1-bit-transparency cursors supported so LWJGL's Cursor.<init> (called on
 * MC's main thread) doesn't throw "Native cursors not supported"; we hand back
 * opaque non-zero cursor handles and no-op the actual X cursor ops. */
#define CURSOR_ONE_BIT_TRANSPARENCY 1
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetNativeCursorCapabilities(JNIEnv* e, jclass c, jlong d) { return CURSOR_ONE_BIT_TRANSPARENCY; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetMinCursorSize(JNIEnv* e, jclass c, jlong d, jlong w) { return 1; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetMaxCursorSize(JNIEnv* e, jclass c, jlong d, jlong w) { return 32; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nCreateCursor(JNIEnv* e, jclass c, jlong d, jint w, jint h, jint xh, jint yh, jint n, jobject imgs, jint io, jobject del, jint dolff) { return (jlong)0x5001; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nCreateBlankCursor(JNIEnv* e, jclass c, jlong d, jlong w) { return (jlong)0x5002; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nDestroyCursor(JNIEnv* e, jclass c, jlong d, jlong cur) {}
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxDisplay_nGetPbufferCapabilities(JNIEnv* e, jclass c, jlong d, jint s) { return 0; }

/* ======================= LinuxDisplayPeerInfo / LinuxPeerInfo ============= *
 * peer-info handle is an opaque ByteBuffer we own. */
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxPeerInfo_createHandle(JNIEnv* e, jclass c) {
    TRACE("LinuxPeerInfo.createHandle");
    return (*e)->NewDirectByteBuffer(e, calloc(1, 64), 64);
}
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxPeerInfo_nGetDisplay(JNIEnv* e, jclass c, jobject h) { return FAKE_DISPLAY; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxPeerInfo_nGetDrawable(JNIEnv* e, jclass c, jobject h) { return FAKE_WINDOW; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplayPeerInfo_initDefaultPeerInfo(JNIEnv* e, jclass c, jlong d, jint s, jobject h, jobject pf) { TRACE("initDefaultPeerInfo"); }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxDisplayPeerInfo_initDrawable(JNIEnv* e, jclass c, jlong window, jobject h) {}

/* ===================== LinuxContextImplementation ========================= *
 * Our WebGL context IS the GLX drawable+context. Create it here, publish frames
 * on swap. */
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nCreate(JNIEnv* e, jclass c, jobject peer, jobject attribs, jobject shared) {
    if (!g_ctx) {
        int r = wgl_create("#glsurface", g_win_w, g_win_h);
        TRACE("nCreate -> wgl_create(%dx%d) = %d", g_win_w, g_win_h, r);
    }
    return (*e)->NewDirectByteBuffer(e, calloc(1, 16), 16);
}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nMakeCurrent(JNIEnv* e, jclass c, jobject peer, jobject ctx) {
    int r = g_ctx ? emscripten_webgl_make_context_current(g_ctx) : -99;
    TRACE("nMakeCurrent ctx=%d -> %d", (int)g_ctx, r);
}
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nIsCurrent(JNIEnv* e, jclass c, jobject ctx) { return g_ctx ? JNI_TRUE : JNI_FALSE; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nSwapBuffers(JNIEnv* e, jclass c, jobject peer) { wgl_present(); }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nReleaseCurrentContext(JNIEnv* e, jclass c, jobject peer) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nSetSwapInterval(JNIEnv* e, jclass c, jobject peer, jobject ctx, jint v) {}
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_nDestroy(JNIEnv* e, jclass c, jobject peer, jobject ctx) {}
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_getGLXContext(JNIEnv* e, jobject o, jobject ctx) { return (jlong)(intptr_t) g_ctx; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxContextImplementation_getDisplay(JNIEnv* e, jobject o, jobject peer) { return FAKE_DISPLAY; }

/* =========================== org.lwjgl.opengl.LinuxKeyboard ================ */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_getModifierMapping(JNIEnv* e, jclass c, jlong d) { TRACE("Keyboard.getModifierMapping"); return 0; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_freeModifierMapping(JNIEnv* e, jclass c, jlong m) {}
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_getMaxKeyPerMod(JNIEnv* e, jclass c, jlong m) { return 0; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_lookupModifierMap(JNIEnv* e, jclass c, jlong m, jint i) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_keycodeToKeySym(JNIEnv* e, jclass c, jlong d, jint kc) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_openIM(JNIEnv* e, jclass c, jlong d) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_createIC(JNIEnv* e, jclass c, jlong xim, jlong w) { return 0; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_setupIMEventMask(JNIEnv* e, jclass c, jlong d, jlong w, jlong xic) {}
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_allocateComposeStatus(JNIEnv* e, jclass c) { return (*e)->NewDirectByteBuffer(e, calloc(1, 64), 64); }
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_nSetDetectableKeyRepeat(JNIEnv* e, jclass c, jlong d, jboolean en) { return JNI_TRUE; }
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_destroyIC(JNIEnv* e, jclass c, jlong xic) {}
JNIEXPORT void  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_closeIM(JNIEnv* e, jclass c, jlong xim) {}
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_lookupString(JNIEnv* e, jclass c, jlong ev, jobject buf, jobject comp) { return 0; }
JNIEXPORT jint  JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_utf8LookupString(JNIEnv* e, jclass c, jlong xic, jlong ev, jobject buf, jint pos, jint size) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_lookupKeysym(JNIEnv* e, jclass c, jlong ev, jint index) { return 0; }
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxKeyboard_toUpper(JNIEnv* e, jclass c, jlong keysym) { return keysym; }

/* ============================ org.lwjgl.opengl.LinuxMouse ================== */
JNIEXPORT jlong JNICALL Java_org_lwjgl_opengl_LinuxMouse_nQueryPointer(JNIEnv* e, jclass c, jlong d, jlong w, jobject result) {
    int* r = (int*)(*e)->GetDirectBufferAddress(e, result);
    if (r) { r[0] = g_mouse_x; r[1] = g_mouse_y; }
    return 0;
}
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxMouse_nGetButtonCount(JNIEnv* e, jclass c, jlong d) { TRACE("Mouse.nGetButtonCount"); return 3; }
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxMouse_nGetWindowWidth(JNIEnv* e, jclass c, jlong d, jlong w) { return g_win_w; }
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxMouse_nGetWindowHeight(JNIEnv* e, jclass c, jlong d, jlong w) { return g_win_h; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxMouse_nWarpCursor(JNIEnv* e, jclass c, jlong d, jlong w, jint x, jint y) { g_mouse_x=x; g_mouse_y=y; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxMouse_nSendWarpEvent(JNIEnv* e, jclass c, jlong d, jlong w, jlong atom, jint cx, jint cy) {}

/* ================== AWT-embedded path (MC parents Display into a Canvas) ===== *
 * Fake the JAWT surface lock: no real drawing surface — LWJGL only needs a
 * "drawable" and we render to #glsurface regardless. getDrawable() already
 * returns FAKE_WINDOW via LinuxPeerInfo, so these just succeed without JAWT. */
JNIEXPORT jobject JNICALL Java_org_lwjgl_opengl_AWTSurfaceLock_createHandle(JNIEnv* e, jclass c) {
    return (*e)->NewDirectByteBuffer(e, calloc(1, 64), 64);
}
JNIEXPORT jboolean JNICALL Java_org_lwjgl_opengl_AWTSurfaceLock_lockAndInitHandle(JNIEnv* e, jclass c, jobject lock, jobject canvas) { return JNI_TRUE; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_AWTSurfaceLock_nUnlock(JNIEnv* e, jclass c, jobject lock) {}
JNIEXPORT jint JNICALL Java_org_lwjgl_opengl_LinuxAWTGLCanvasPeerInfo_getScreenFromSurfaceInfo(JNIEnv* e, jclass c, jobject surf) { return 0; }
JNIEXPORT void JNICALL Java_org_lwjgl_opengl_LinuxAWTGLCanvasPeerInfo_nInitHandle(JNIEnv* e, jclass c, jint screen, jobject surf, jobject peer) {}
