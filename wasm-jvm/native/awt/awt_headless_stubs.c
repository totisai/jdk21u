/* Empty headless stubs for native initIDs whose defining files (awt_Font.c,
 * etc.) pull in X11/platform font machinery not compiled for the wasm target.
 * The upstream implementations are themselves empty stubs. */
#include <jni.h>

JNIEXPORT void JNICALL Java_java_awt_Font_initIDs(JNIEnv *env, jclass cls) {}

/* CFontManager (macOS CoreText) registers *system* fonts. The wasm build has no
 * CoreText and uses only file fonts (e.g. Roboto in /jdk/lib/fonts) via the
 * FreetypeFontScaler path, so these become no-ops. */
JNIEXPORT void JNICALL Java_sun_font_CFontManager_loadNativeDirFonts(JNIEnv *env, jobject self, jstring path) {}
JNIEXPORT void JNICALL Java_sun_font_CFontManager_loadNativeFonts(JNIEnv *env, jobject self) {}

/* Empty initIDs stubs for the AWT component/event classes exercised once the
 * environment is non-headless (real windows). These cache no field IDs — the
 * wasm window peers are pure Java — matching the macOS build's empty stubs. */
#define IIDS(cls) JNIEXPORT void JNICALL Java_java_awt_##cls##_initIDs(JNIEnv *env, jclass c) {}
IIDS(AWTEvent) IIDS(Checkbox) IIDS(Component) IIDS(Container) IIDS(Cursor)
IIDS(Dialog) IIDS(Event) IIDS(Frame) IIDS(Insets) IIDS(Menu) IIDS(MenuItem)
IIDS(ScrollPane) IIDS(Scrollbar) IIDS(TextArea) IIDS(Window) IIDS(KeyboardFocusManager)
JNIEXPORT void JNICALL Java_java_awt_event_InputEvent_initIDs(JNIEnv *env, jclass c) {}
JNIEXPORT void JNICALL Java_java_awt_event_KeyEvent_initIDs(JNIEnv *env, jclass c) {}

/* No splash screen in the wasm build. */
JNIEXPORT void JNICALL Java_sun_awt_SunToolkit_closeSplashScreen(JNIEnv *env, jclass c) {}
