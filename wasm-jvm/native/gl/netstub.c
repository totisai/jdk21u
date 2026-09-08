/*
 * Emscripten's syscall layer has no socketpair(), but sun.nio.ch.UnixDispatcher's
 * static init needs one for its interrupt self-pipe. Without it, UnixDispatcher
 * <clinit> throws, NioSocketImpl <clinit> fails, and every network attempt (MC's
 * stats snooper, resource download) NoClassDefFoundErrors. Back socketpair with a
 * pipe (the self-pipe wakeup only writes one direction), so the NIO stack
 * initialises and networking degrades to a clean, caught IOException at connect()
 * instead of a class-init cascade.
 *
 * Defined here (linked before libc) so it overrides musl's syscall-backed version.
 */
#include <unistd.h>
#include <stddef.h>

#ifndef USE_PROXY_SOCKETS
/* When PROXY_POSIX_SOCKETS is enabled, emscripten's websocket-backed sockets
 * layer provides a real socketpair(); defining our own would clash. */
int socketpair(int domain, int type, int protocol, int sv[2]) {
    (void)domain; (void)type; (void)protocol;
    return pipe(sv);
}
#endif

/* wasm has no page protection, so emscripten stubs mprotect as an "unsupported
 * syscall" and warns on every call — the JVM calls it constantly (stack guard
 * pages etc.), flooding the console. Override it as a successful no-op: same
 * behaviour (protection was never enforced), minus the syscall + warning. */
int mprotect(void* addr, size_t len, int prot) {
    (void)addr; (void)len; (void)prot;
    return 0;
}
