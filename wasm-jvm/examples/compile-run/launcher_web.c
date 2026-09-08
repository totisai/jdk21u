#include <jni.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/posix_socket.h>
#include <emscripten/websocket.h>
#include <emscripten/threading.h>
#endif

/* Browser launcher: the JDK runtime (exploded java.base modules + support files)
 * and the application classes are packaged into the wasm MEMFS via --preload-file
 * at the short paths /jdk and /app. Unlike the Node launcher this uses no
 * NODERAWFS; everything is read from the in-memory virtual filesystem. */
static const char* JHOME = "/jdk";

int main(int argc, char** argv) {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    setenv("JAVA_HOME", JHOME, 1);

    /* The set of resolved modules can be extended per-run: if /work/addmods
     * exists, its (single-line) contents become the --add-modules value. This
     * lets a template that needs extra platform modules (e.g. java.desktop for
     * Spring) request them without baking them into every build. */
    static char addmods[512] = "--add-modules=jdk.compiler,java.logging,jdk.unsupported";
    FILE* af = fopen("/work/addmods", "r");
    if (af) {
        char line[400];
        if (fgets(line, sizeof(line), af)) {
            size_t n = strlen(line);
            while (n > 0 && (line[n-1] == '\n' || line[n-1] == '\r')) line[--n] = 0;
            if (n > 0) snprintf(addmods, sizeof(addmods), "--add-modules=%s", line);
        }
        fclose(af);
    }

    JavaVM* jvm; JNIEnv* env;
    JavaVMOption opts[6];
    opts[0].optionString = "-Djava.class.path=/app";
    opts[1].optionString = "-Djava.home=/jdk";
    opts[2].optionString = "-Djava.library.path=/jdk/lib";
    opts[3].optionString = "-XX:-UsePerfData";
    opts[4].optionString = "-XX:+UseSerialGC";
    opts[5].optionString = addmods;
    JavaVMInitArgs args;
    args.version = JNI_VERSION_1_8;
    args.nOptions = 6;
    args.options = opts;
    args.ignoreUnrecognized = JNI_TRUE;

    printf("[launcher] calling JNI_CreateJavaVM...\n"); fflush(stdout);
    jint rc = JNI_CreateJavaVM(&jvm, (void**)&env, &args);
    printf("[launcher] JNI_CreateJavaVM returned %d\n", (int)rc); fflush(stdout);
    if (rc != JNI_OK) return 1;

#ifdef __EMSCRIPTEN__
    /* If /work/bridge holds a WebSocket URL, wire the JVM's POSIX sockets to the
     * websocket_to_posix_proxy relay at that URL. We connect it now — the WS opens
     * asynchronously on the main thread while VM init / javac compilation runs, so
     * it is OPEN long before any Java socket call happens. */
    {
        FILE* bf = fopen("/work/bridge", "r");
        if (bf) {
            char url[256];
            if (fgets(url, sizeof(url), bf)) {
                size_t n = strlen(url);
                while (n > 0 && (url[n-1] == '\n' || url[n-1] == '\r')) url[--n] = 0;
                if (n > 0) {
                    printf("[launcher] connecting socket bridge -> %s\n", url); fflush(stdout);
                    emscripten_init_websocket_to_posix_socket_bridge(url);
                    /* Wait until the bridge WebSocket is OPEN before letting Java
                     * touch a socket — the bridge sends without checking readiness.
                     * The bridge is the first (and only) websocket, so its handle
                     * is 1. emscripten_thread_sleep yields so the main thread can
                     * process the open event. */
                    unsigned short st = 0; int tries = 0;
                    for (; tries < 200; tries++) {
                        if (emscripten_websocket_get_ready_state(1, &st) != EMSCRIPTEN_RESULT_SUCCESS) break;
                        if (st == 1 /* OPEN */) break;
                        emscripten_thread_sleep(50);
                    }
                    printf("[launcher] socket bridge ready_state=%d (after %d waits)\n", (int)st, tries);
                    fflush(stdout);
                }
            }
            fclose(bf);
        }
    }
#endif

    const char* mainClass = (argc > 1) ? argv[1] : "Hello";
    jclass cls = (*env)->FindClass(env, mainClass);
    if (!cls) { printf("[launcher] class %s not found\n", mainClass); (*env)->ExceptionDescribe(env); return 2; }
    jmethodID mid = (*env)->GetStaticMethodID(env, cls, "main", "([Ljava/lang/String;)V");
    if (!mid) { printf("[launcher] main not found\n"); return 3; }
    jclass strCls = (*env)->FindClass(env, "java/lang/String");
    jobjectArray jargs = (*env)->NewObjectArray(env, 0, strCls, NULL);
    printf("[launcher] invoking %s.main...\n", mainClass); fflush(stdout);
    (*env)->CallStaticVoidMethod(env, cls, mid, jargs);
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionDescribe(env);
    printf("[launcher] done\n"); fflush(stdout);
    return 0;
}
