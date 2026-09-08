/*
 * Stub LWJGL OpenAL library-load hooks for the wasm JVM. The AL10/ALC10/AL11
 * entry points are generated (al_gen.c); these four are the library lifecycle
 * natives on org.lwjgl.openal.AL. We don't load a real OpenAL — AL.nCreate is a
 * no-op so AL.create() proceeds to "open" our stub device/context, letting
 * paulscode's sound library initialise (silently) instead of half-failing and
 * NPEing in SoundSystem.playing(), which crashes Minecraft.
 */
#include <jni.h>

JNIEXPORT void JNICALL Java_org_lwjgl_openal_AL_nCreate(JNIEnv* e, jclass c, jstring paths) {}
JNIEXPORT void JNICALL Java_org_lwjgl_openal_AL_nCreateDefault(JNIEnv* e, jclass c) {}
JNIEXPORT void JNICALL Java_org_lwjgl_openal_AL_nDestroy(JNIEnv* e, jclass c) {}
JNIEXPORT void JNICALL Java_org_lwjgl_openal_AL_resetNativeStubs(JNIEnv* e, jclass c, jobject cls) {}
