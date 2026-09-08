/*
 * jdkstubs.c — benign fallbacks for JDK/libc natives the wasm (Zero/emscripten)
 * port does not implement. Without them, emscripten links each as a stub that
 * aborts the whole VM ("missing function: X") the first time it is called.
 *
 * These are the symbols reached by real frameworks (e.g. Spring Boot reads the
 * current PID at startup -> ProcessHandleImpl.initNative -> os_initNative) that the
 * demo apps never exercised. Every stub degrades gracefully: process introspection
 * returns "no info", extended attributes report unsupported, timestamp updates are
 * no-ops. All symbols here are confirmed absent from the build, so defining them
 * cannot clash with a real implementation.
 */
#ifdef __EMSCRIPTEN__
#include <jni.h>
#include <sys/types.h>
#include <sys/time.h>
#include <signal.h>
#include <errno.h>
#include <wchar.h>
#include <time.h>
#include <stddef.h>

/* ---- ProcessHandleImpl OS helpers (src/java.base/unix/native/libjava) -------- */
void os_initNative(JNIEnv *env, jclass clazz) { (void)env; (void)clazz; }

jint os_getChildren(JNIEnv *env, jlong jpid, jlongArray array,
                    jlongArray jparentArray, jlongArray jstimesArray) {
  (void)env; (void)jpid; (void)array; (void)jparentArray; (void)jstimesArray;
  return 0;   /* no children */
}

pid_t os_getParentPidAndTimings(JNIEnv *env, pid_t pid, jlong *total, jlong *start) {
  (void)env; (void)pid;
  if (total) *total = -1;
  if (start) *start = -1;
  return (pid_t)-1;   /* parent unknown */
}

void os_getCmdlineAndUserInfo(JNIEnv *env, jobject jinfo, pid_t pid) {
  (void)env; (void)jinfo; (void)pid;   /* leave the Info object untouched */
}

/* ---- libc bits emscripten/musl does not provide ------------------------------ */
ssize_t fgetxattr(int fd, const char *name, void *value, size_t size) {
  (void)fd; (void)name; (void)value; (void)size; errno = ENOTSUP; return -1;
}
int fsetxattr(int fd, const char *name, const void *value, size_t size, int flags) {
  (void)fd; (void)name; (void)value; (void)size; (void)flags; errno = ENOTSUP; return -1;
}
ssize_t flistxattr(int fd, char *list, size_t size) {
  (void)fd; (void)list; (void)size; errno = ENOTSUP; return -1;
}
int fremovexattr(int fd, const char *name) {
  (void)fd; (void)name; errno = ENOTSUP; return -1;
}
int futimes(int fd, const struct timeval tv[2]) { (void)fd; (void)tv; return 0; }
int lutimes(const char *path, const struct timeval tv[2]) { (void)path; (void)tv; return 0; }
int sigsuspend(const sigset_t *mask) { (void)mask; errno = EINTR; return -1; }
size_t wcsftime(wchar_t *s, size_t maxsize, const wchar_t *format, const struct tm *tm) {
  (void)format; (void)tm; if (maxsize > 0) s[0] = 0; return 0;
}

#endif /* __EMSCRIPTEN__ */
