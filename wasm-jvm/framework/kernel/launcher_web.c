#include <jni.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/posix_socket.h>
#include <emscripten/websocket.h>
#include <emscripten/threading.h>
#endif

/* Browser launcher / integration kernel for the wasm JVM.
 *
 * The JDK runtime (exploded java.base modules + support files) and application
 * classes are packaged into the wasm MEMFS via --preload-file at the short paths
 * /jdk and /app. Everything else is configured at RUN TIME by the embedding host
 * (the WasmJVM JS SDK) writing small control files into /work before the module
 * runs, so one built artifact can host many different apps without relinking:
 *
 *   /work/classpath  one line   -> -Djava.class.path       (default "/app")
 *   /work/addmods    one line   -> --add-modules=<csv>      (default below)
 *   /work/vmopts     N lines    -> one extra JVM option per non-empty line
 *   /work/args       N lines    -> one program argument per line (passed to main)
 *   /work/bridge     one line   -> WebSocket relay URL for real TCP sockets
 *   /work/src.java   + uselib    -> source for the in-VM compile-and-run driver
 *
 * The main class is argv[1] (the JS `arguments:[mainClass]`), defaulting to Hello.
 */
static const char* JHOME = "/jdk";

/* Read the first line of a file into buf (newline-stripped). Returns 1 on success. */
static int read_line_file(const char* path, char* buf, size_t buflen) {
    FILE* f = fopen(path, "r");
    if (!f) return 0;
    int ok = 0;
    if (fgets(buf, (int)buflen, f)) {
        size_t n = strlen(buf);
        while (n > 0 && (buf[n-1] == '\n' || buf[n-1] == '\r')) buf[--n] = 0;
        ok = (n > 0);
    }
    fclose(f);
    return ok;
}

#define MAX_OPTS 128
#define MAX_ARGS 64

int main(int argc, char** argv) {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    setenv("JAVA_HOME", JHOME, 1);

    /* ---- assemble JVM options --------------------------------------------- */
    JavaVMOption opts[MAX_OPTS];
    int n = 0;

    /* classpath: /work/classpath overrides the default /app */
    static char cp[16384] = "-Djava.class.path=/app";
    { char v[16000]; if (read_line_file("/work/classpath", v, sizeof(v)))
        snprintf(cp, sizeof(cp), "-Djava.class.path=%s", v); }
    opts[n++].optionString = cp;

    opts[n++].optionString = "-Djava.home=/jdk";
    opts[n++].optionString = "-Djava.library.path=/jdk/lib";
    opts[n++].optionString = "-XX:-UsePerfData";
    opts[n++].optionString = "-XX:+UseSerialGC";
    /* AWT-only options — added only when the java.desktop module is present, so
     * the base/net tiers (no desktop) boot without spurious warnings. */
    if (access("/jdk/modules/java.desktop", F_OK) == 0) {
        opts[n++].optionString = "-Dsun.awt.fontconfig=/jdk/lib/fontconfig.properties";
        opts[n++].optionString = "--add-exports=java.desktop/sun.awt=ALL-UNNAMED";
    }

    /* --add-modules: /work/addmods overrides the default set */
    static char addmods[1024] = "--add-modules=jdk.compiler,java.logging,jdk.unsupported";
    { char v[900]; if (read_line_file("/work/addmods", v, sizeof(v)))
        snprintf(addmods, sizeof(addmods), "--add-modules=%s", v); }
    opts[n++].optionString = addmods;

    /* extra JVM options: one per non-empty line of /work/vmopts */
    FILE* vf = fopen("/work/vmopts", "r");
    if (vf) {
        char line[512];
        while (n < MAX_OPTS && fgets(line, sizeof(line), vf)) {
            size_t ln = strlen(line);
            while (ln > 0 && (line[ln-1] == '\n' || line[ln-1] == '\r')) line[--ln] = 0;
            if (ln > 0) opts[n++].optionString = strdup(line);
        }
        fclose(vf);
    }

    JavaVMInitArgs vm_args;
    vm_args.version = JNI_VERSION_1_8;
    vm_args.nOptions = n;
    vm_args.options = opts;
    vm_args.ignoreUnrecognized = JNI_TRUE;

#if defined(__EMSCRIPTEN__) && !defined(EMUNET)
    /* If /work/bridge holds a WebSocket URL, wire the JVM's POSIX sockets to the
     * websocket_to_posix_proxy relay. Connect it BEFORE JNI_CreateJavaVM so the
     * proxied socket layer is live during VM init (which may touch sockets under
     * PROXY_POSIX_SOCKETS), avoiding a deadlock.
     * (Skipped in the emunet tier: sockets are served by an in-sandbox loopback
     * stack — emunet.c — so there is no relay to connect.) */
    {
        char url[256];
        if (read_line_file("/work/bridge", url, sizeof(url))) {
            printf("[launcher] connecting socket bridge -> %s\n", url); fflush(stdout);
            emscripten_init_websocket_to_posix_socket_bridge(url);
            /* Wait until the bridge WebSocket is OPEN before letting Java touch a
             * socket. The bridge is the first (and only) websocket, so handle is 1. */
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
#endif

    JavaVM* jvm; JNIEnv* env;
    printf("[launcher] calling JNI_CreateJavaVM...\n"); fflush(stdout);
    jint rc = JNI_CreateJavaVM(&jvm, (void**)&env, &vm_args);
    printf("[launcher] JNI_CreateJavaVM returned %d\n", (int)rc); fflush(stdout);
    if (rc != JNI_OK) return 1;

    const char* mainClass = (argc > 1) ? argv[1] : "Hello";
    /* FindClass wants the JNI internal form (slashes), so accept a dotted FQN
     * like "demo.App" and translate '.' -> '/'. */
    char mc[1024]; strncpy(mc, mainClass, sizeof(mc) - 1); mc[sizeof(mc) - 1] = 0;
    for (char* p = mc; *p; p++) if (*p == '.') *p = '/';
    jclass cls = (*env)->FindClass(env, mc);
    if (!cls) { printf("[launcher] class %s not found\n", mainClass); (*env)->ExceptionDescribe(env); return 2; }
    jmethodID mid = (*env)->GetStaticMethodID(env, cls, "main", "([Ljava/lang/String;)V");
    if (!mid) { printf("[launcher] main not found\n"); return 3; }
    jclass strCls = (*env)->FindClass(env, "java/lang/String");

    /* program args: one per line of /work/args, passed to main(String[]) */
    char* argvals[MAX_ARGS]; int nargs = 0;
    FILE* gf = fopen("/work/args", "r");
    if (gf) {
        char line[1024];
        while (nargs < MAX_ARGS && fgets(line, sizeof(line), gf)) {
            size_t ln = strlen(line);
            while (ln > 0 && (line[ln-1] == '\n' || line[ln-1] == '\r')) line[--ln] = 0;
            argvals[nargs++] = strdup(line);
        }
        fclose(gf);
    }
    jobjectArray jargs = (*env)->NewObjectArray(env, nargs, strCls, NULL);
    for (int i = 0; i < nargs; i++) {
        jstring s = (*env)->NewStringUTF(env, argvals[i]);
        (*env)->SetObjectArrayElement(env, jargs, i, s);
    }

    printf("[launcher] invoking %s.main...\n", mainClass); fflush(stdout);
    (*env)->CallStaticVoidMethod(env, cls, mid, jargs);
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionDescribe(env);
    printf("[launcher] done\n"); fflush(stdout);
    return 0;
}
