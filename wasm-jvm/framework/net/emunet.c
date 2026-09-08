/*
 * emunet — an in-sandbox loopback TCP stack for the wasm JVM.
 *
 * Goal: let a real Java server (Tomcat/Jetty/Undertow/Netty, com.sun.net.httpserver,
 * or a plain ServerSocket) bind and accept connections, and let the browser page
 * connect and speak HTTP — all WITHOUT any real socket, WebSocket, or relay. Every
 * byte lives in wasm linear memory.
 *
 * It is a drop-in alternative to wsps.c (the WebSocket->relay bridge). Interception
 * is at the SYSCALL layer (not HTTP), so it is framework-agnostic: the whole POSIX
 * socket surface the JDK uses is intercepted via -Wl,--wrap=<call>, and emu socket
 * fds live at >= EMU_FD_BASE so they never collide with MEMFS fds. Non-socket fds
 * (files, the selector's wakeup pipe) fall through to __real_* untouched.
 *
 * Model:
 *   - A listening socket owns an accept queue of established connections.
 *   - connect() finds the listener on the target port, creates a Conn (two one-way
 *     byte rings: c2s and s2c), and enqueues the server end for accept().
 *   - The browser reaches in through the EMSCRIPTEN_KEEPALIVE emunet_* entry points,
 *     which are just another connect()/send()/recv() peer.
 *
 * Blocking accept()/recv()/poll() spin with a short sleep rather than condvars, so
 * they compose trivially with JS-thread callers and mixed real/emu pollsets. Good
 * enough for a loopback PoC; can move to futex wakeups later.
 */
#ifdef __EMSCRIPTEN__
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdarg.h>
#include <pthread.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/uio.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <emscripten.h>
#include <emscripten/threading.h>

#define EMU_FD_BASE     1000000
#define EMU_MAX_SOCKS   4096
#define EMU_MAX_CONNS   4096
#define EMU_RING        (256 * 1024)   /* per-direction byte ring (power of two) */
#define EMU_BACKLOG     128

/* __real_* : the original libc calls, reached for non-emu fds. */
extern int     __real_socket(int, int, int);
extern int     __real_socketpair(int, int, int, int[2]);
extern int     __real_bind(int, const struct sockaddr*, socklen_t);
extern int     __real_listen(int, int);
extern int     __real_connect(int, const struct sockaddr*, socklen_t);
extern int     __real_accept(int, struct sockaddr*, socklen_t*);
extern int     __real_accept4(int, struct sockaddr*, socklen_t*, int);
extern int     __real_shutdown(int, int);
extern int     __real_getsockname(int, struct sockaddr*, socklen_t*);
extern int     __real_getpeername(int, struct sockaddr*, socklen_t*);
extern int     __real_getsockopt(int, int, int, void*, socklen_t*);
extern int     __real_setsockopt(int, int, int, const void*, socklen_t);
extern ssize_t __real_send(int, const void*, size_t, int);
extern ssize_t __real_recv(int, void*, size_t, int);
extern ssize_t __real_sendto(int, const void*, size_t, int, const struct sockaddr*, socklen_t);
extern ssize_t __real_recvfrom(int, void*, size_t, int, struct sockaddr*, socklen_t*);
extern ssize_t __real_read(int, void*, size_t);
extern ssize_t __real_write(int, const void*, size_t);
extern int     __real_close(int);
extern ssize_t __real_readv(int, const struct iovec*, int);
extern ssize_t __real_writev(int, const struct iovec*, int);
extern int     __real_poll(struct pollfd*, nfds_t, int);
extern int     __real_fcntl(int, int, ...);

/* One direction of a connection: a single-producer/single-consumer byte ring. */
typedef struct {
  uint8_t *buf;
  uint32_t head;      /* read position  */
  uint32_t tail;      /* write position */
  int      closed;    /* writer half shut down */
} Ring;

typedef struct {
  int   used;
  Ring  c2s;          /* client -> server */
  Ring  s2c;          /* server -> client */
} Conn;

typedef struct {
  int      used;
  int      is_listen;
  int      nonblock;
  uint16_t port;      /* host byte order */
  int      conn;      /* index into conns, or -1 for a listener */
  int      end;       /* 0 = client end, 1 = server end */
  int      backlog[EMU_BACKLOG];   /* listener accept queue (conn indices) */
  int      bl_head, bl_tail;
} Sock;

static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static Sock g_socks[EMU_MAX_SOCKS];
static Conn g_conns[EMU_MAX_CONNS];

#define LOCK()   pthread_mutex_lock(&g_lock)
#define UNLOCK() pthread_mutex_unlock(&g_lock)

static inline int   sidx(int fd)   { return fd - EMU_FD_BASE; }
static inline int   is_emu(int fd) { return fd >= EMU_FD_BASE && fd < EMU_FD_BASE + EMU_MAX_SOCKS; }
static inline Sock* sk(int fd)     { return &g_socks[sidx(fd)]; }

/* ---- ring helpers (caller holds g_lock) ------------------------------------- */
static uint32_t ring_len(const Ring *r)   { return r->tail - r->head; }
static uint32_t ring_space(const Ring *r) { return EMU_RING - ring_len(r); }

static uint32_t ring_write(Ring *r, const uint8_t *src, uint32_t n) {
  uint32_t space = ring_space(r);
  if (n > space) n = space;
  for (uint32_t i = 0; i < n; i++) r->buf[(r->tail + i) & (EMU_RING - 1)] = src[i];
  r->tail += n;
  return n;
}
static uint32_t ring_read(Ring *r, uint8_t *dst, uint32_t n) {
  uint32_t avail = ring_len(r);
  if (n > avail) n = avail;
  for (uint32_t i = 0; i < n; i++) dst[i] = r->buf[(r->head + i) & (EMU_RING - 1)];
  r->head += n;
  return n;
}

static int alloc_sock(void) {
  for (int i = 0; i < EMU_MAX_SOCKS; i++)
    if (!g_socks[i].used) {
      memset(&g_socks[i], 0, sizeof(Sock));
      g_socks[i].used = 1; g_socks[i].conn = -1;
      return EMU_FD_BASE + i;
    }
  return -1;
}
static int alloc_conn(void) {
  for (int i = 0; i < EMU_MAX_CONNS; i++)
    if (!g_conns[i].used) {
      Conn *c = &g_conns[i];
      memset(c, 0, sizeof(Conn));
      c->used = 1;
      c->c2s.buf = (uint8_t*)malloc(EMU_RING);
      c->s2c.buf = (uint8_t*)malloc(EMU_RING);
      if (!c->c2s.buf || !c->s2c.buf) { free(c->c2s.buf); free(c->s2c.buf); c->used = 0; return -1; }
      return i;
    }
  return -1;
}
static void free_conn_if_dead(int ci) {
  Conn *c = &g_conns[ci];
  if (c->used && c->c2s.closed && c->s2c.closed && ring_len(&c->c2s) == 0 && ring_len(&c->s2c) == 0) {
    free(c->c2s.buf); free(c->s2c.buf); c->used = 0;
  }
}
static Sock* find_listener(uint16_t port) {   /* caller holds g_lock */
  for (int i = 0; i < EMU_MAX_SOCKS; i++)
    if (g_socks[i].used && g_socks[i].is_listen && g_socks[i].port == port)
      return &g_socks[i];
  return NULL;
}
static uint16_t port_of(const struct sockaddr *a) {
  if (!a) return 0;
  if (a->sa_family == AF_INET6) return ntohs(((struct sockaddr_in6*)a)->sin6_port);
  return ntohs(((struct sockaddr_in*)a)->sin_port);
}
/* directions for an endpoint: (rx, tx) rings for `end` of conn `ci`. */
static void dirs(int ci, int end, Ring **rx, Ring **tx) {
  Conn *c = &g_conns[ci];
  if (end == 1) { *rx = &c->c2s; *tx = &c->s2c; }   /* server reads c2s, writes s2c */
  else          { *rx = &c->s2c; *tx = &c->c2s; }   /* client reads s2c, writes c2s */
}

/* Establish a connection to `port`; returns the client-side sock fd, or -1. */
static int emu_open_client(uint16_t port) {
  LOCK();
  Sock *l = find_listener(port);
  if (!l || (l->bl_tail - l->bl_head) >= EMU_BACKLOG) { UNLOCK(); errno = ECONNREFUSED; return -1; }
  int ci = alloc_conn();
  if (ci < 0) { UNLOCK(); errno = ENOMEM; return -1; }
  int cfd = alloc_sock();
  if (cfd < 0) { g_conns[ci].used = 0; UNLOCK(); errno = EMFILE; return -1; }
  Sock *cs = sk(cfd);
  cs->conn = ci; cs->end = 0; cs->port = port;
  l->backlog[(l->bl_tail++) % EMU_BACKLOG] = ci;
  UNLOCK();
  return cfd;
}

/* ======================= wrapped POSIX socket surface ======================= */

int __wrap_socket(int domain, int type, int protocol) {
  if (domain != AF_INET && domain != AF_INET6) return __real_socket(domain, type, protocol);
  if ((type & 0xff) != SOCK_STREAM)             return __real_socket(domain, type, protocol);
  LOCK();
  int fd = alloc_sock();
  if (fd >= 0 && (type & SOCK_NONBLOCK)) sk(fd)->nonblock = 1;
  UNLOCK();
  if (fd < 0) { errno = EMFILE; return -1; }
  return fd;
}

int __wrap_socketpair(int domain, int type, int protocol, int sv[2]) {
  (void)domain; (void)type; (void)protocol;
  LOCK();
  int ci = alloc_conn();
  int a = ci >= 0 ? alloc_sock() : -1;
  int b = a  >= 0 ? alloc_sock() : -1;
  if (b < 0) { if (ci >= 0) g_conns[ci].used = 0; UNLOCK(); errno = ENFILE; return -1; }
  sk(a)->conn = ci; sk(a)->end = 0;
  sk(b)->conn = ci; sk(b)->end = 1;
  UNLOCK();
  sv[0] = a; sv[1] = b;
  return 0;
}

int __wrap_bind(int socket, const struct sockaddr *address, socklen_t address_len) {
  if (!is_emu(socket)) return __real_bind(socket, address, address_len);
  LOCK(); sk(socket)->port = port_of(address); UNLOCK();
  return 0;
}

int __wrap_listen(int socket, int backlog) {
  (void)backlog;
  if (!is_emu(socket)) return __real_listen(socket, backlog);
  LOCK(); Sock *s = sk(socket); s->is_listen = 1; s->bl_head = s->bl_tail = 0; UNLOCK();
  return 0;
}

int __wrap_connect(int socket, const struct sockaddr *address, socklen_t address_len) {
  if (!is_emu(socket)) return __real_connect(socket, address, address_len);
  uint16_t port = port_of(address);
  LOCK();
  Sock *s = sk(socket);
  Sock *l = find_listener(port);
  if (!l || (l->bl_tail - l->bl_head) >= EMU_BACKLOG) { UNLOCK(); errno = ECONNREFUSED; return -1; }
  int ci = alloc_conn();
  if (ci < 0) { UNLOCK(); errno = ENOMEM; return -1; }
  s->conn = ci; s->end = 0; s->port = port;
  l->backlog[(l->bl_tail++) % EMU_BACKLOG] = ci;
  UNLOCK();
  return 0;   /* loopback connect completes immediately */
}

static int accept_common(int socket, int extra_nonblock) {
  if (!is_emu(socket)) { errno = EINVAL; return -1; }
  for (;;) {
    LOCK();
    Sock *l = sk(socket);
    if (!l->is_listen) { UNLOCK(); errno = EINVAL; return -1; }
    if (l->bl_tail != l->bl_head) {
      int ci = l->backlog[(l->bl_head++) % EMU_BACKLOG];
      int fd = alloc_sock();
      if (fd < 0) { UNLOCK(); errno = EMFILE; return -1; }
      Sock *ss = sk(fd);
      ss->conn = ci; ss->end = 1; ss->port = l->port; ss->nonblock = extra_nonblock;
      UNLOCK();
      return fd;
    }
    int nb = extra_nonblock || l->nonblock;
    UNLOCK();
    if (nb) { errno = EAGAIN; return -1; }
    emscripten_thread_sleep(2);
  }
}
int __wrap_accept(int socket, struct sockaddr *address, socklen_t *address_len) {
  if (!is_emu(socket)) return __real_accept(socket, address, address_len);
  if (address_len) *address_len = 0;
  return accept_common(socket, 0);
}
int __wrap_accept4(int socket, struct sockaddr *address, socklen_t *address_len, int flags) {
  if (!is_emu(socket)) return __real_accept4(socket, address, address_len, flags);
  if (address_len) *address_len = 0;
  return accept_common(socket, (flags & SOCK_NONBLOCK) ? 1 : 0);
}

ssize_t __wrap_send(int socket, const void *message, size_t length, int flags) {
  (void)flags;
  if (!is_emu(socket)) return __real_send(socket, message, length, flags);
  for (;;) {
    LOCK();
    Sock *s = sk(socket);
    if (s->conn < 0) { UNLOCK(); errno = ENOTCONN; return -1; }
    Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
    if (rx->closed && tx->closed) { UNLOCK(); errno = EPIPE; return -1; }
    uint32_t n = ring_write(tx, (const uint8_t*)message, (uint32_t)length);
    int nb = s->nonblock;
    UNLOCK();
    if (n > 0) return (ssize_t)n;
    if (length == 0) return 0;
    if (nb) { errno = EAGAIN; return -1; }
    emscripten_thread_sleep(1);
  }
}

ssize_t __wrap_recv(int socket, void *buffer, size_t length, int flags) {
  (void)flags;
  if (!is_emu(socket)) return __real_recv(socket, buffer, length, flags);
  for (;;) {
    LOCK();
    Sock *s = sk(socket);
    if (s->conn < 0) { UNLOCK(); errno = ENOTCONN; return -1; }
    Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
    uint32_t avail = ring_len(rx);
    if (avail > 0) { uint32_t n = ring_read(rx, (uint8_t*)buffer, (uint32_t)length); UNLOCK(); return (ssize_t)n; }
    if (rx->closed) { UNLOCK(); return 0; }
    int nb = s->nonblock;
    UNLOCK();
    if (nb) { errno = EAGAIN; return -1; }
    emscripten_thread_sleep(1);
  }
}

ssize_t __wrap_sendto(int s, const void *m, size_t l, int f, const struct sockaddr *a, socklen_t al) {
  if (!is_emu(s)) return __real_sendto(s, m, l, f, a, al);
  return __wrap_send(s, m, l, f);
}
ssize_t __wrap_recvfrom(int s, void *b, size_t l, int f, struct sockaddr *a, socklen_t *al) {
  if (!is_emu(s)) return __real_recvfrom(s, b, l, f, a, al);
  if (a && al) *al = 0;
  return __wrap_recv(s, b, l, f);
}

int __wrap_shutdown(int socket, int how) {
  if (!is_emu(socket)) return __real_shutdown(socket, how);
  LOCK();
  Sock *s = sk(socket);
  if (s->conn >= 0) {
    Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
    if (how == SHUT_WR || how == SHUT_RDWR) tx->closed = 1;
    if (how == SHUT_RD || how == SHUT_RDWR) rx->closed = 1;
  }
  UNLOCK();
  return 0;
}

int __wrap_getsockname(int socket, struct sockaddr *address, socklen_t *address_len) {
  if (!is_emu(socket)) return __real_getsockname(socket, address, address_len);
  if (address && address_len && *address_len >= (socklen_t)sizeof(struct sockaddr_in)) {
    struct sockaddr_in sin; memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_addr.s_addr = htonl(0x7f000001);   /* 127.0.0.1 */
    LOCK(); sin.sin_port = htons(sk(socket)->port); UNLOCK();
    memcpy(address, &sin, sizeof(sin));
    *address_len = sizeof(sin);
  }
  return 0;
}
int __wrap_getpeername(int socket, struct sockaddr *address, socklen_t *address_len) {
  if (!is_emu(socket)) return __real_getpeername(socket, address, address_len);
  return __wrap_getsockname(socket, address, address_len);
}

int __wrap_getsockopt(int socket, int level, int name, void *val, socklen_t *len) {
  if (!is_emu(socket)) return __real_getsockopt(socket, level, name, val, len);
  (void)level; (void)name;
  if (val && len && *len >= (socklen_t)sizeof(int)) { *(int*)val = 0; *len = sizeof(int); }
  return 0;
}
int __wrap_setsockopt(int socket, int level, int name, const void *val, socklen_t len) {
  if (!is_emu(socket)) return __real_setsockopt(socket, level, name, val, len);
  (void)level; (void)name; (void)val; (void)len;
  return 0;   /* SO_REUSEADDR/TCP_NODELAY/... are no-ops on loopback */
}

/* fcntl: F_GETFL/F_SETFL on emu fds toggle non-blocking; everything else forwards. */
int __wrap_fcntl(int fd, int cmd, ...) {
  va_list ap; va_start(ap, cmd);
  if (is_emu(fd)) {
    int r = 0;
    LOCK();
    Sock *s = sk(fd);
    if (cmd == F_GETFL)      r = s->nonblock ? O_NONBLOCK : 0;
    else if (cmd == F_SETFL) { int flags = va_arg(ap, int); s->nonblock = (flags & O_NONBLOCK) ? 1 : 0; }
    UNLOCK();
    va_end(ap);
    return r;
  }
  void *arg = va_arg(ap, void*);
  va_end(ap);
  return __real_fcntl(fd, cmd, arg);
}

/* poll: split emu and real fds. Real fds go to __real_poll (non-blocking snapshot);
 * emu fds are checked in-memory. Spin with a short sleep until ready or timeout. */
static int poll_emu_ready(struct pollfd *p) {
  int revents = 0;
  LOCK();
  Sock *s = sk(p->fd);
  if (s->is_listen) {
    if (s->bl_tail != s->bl_head) revents |= POLLIN;
  } else if (s->conn >= 0) {
    Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
    if ((p->events & POLLIN)  && (ring_len(rx) > 0 || rx->closed)) revents |= POLLIN;
    if ((p->events & POLLOUT) && ring_space(tx) > 0)               revents |= POLLOUT;
    if (rx->closed && tx->closed) revents |= POLLHUP;
  }
  UNLOCK();
  return revents & (p->events | POLLHUP | POLLERR);
}
int __wrap_poll(struct pollfd *fds, nfds_t nfds, int timeout) {
  double deadline = (timeout < 0) ? -1.0 : emscripten_get_now() + timeout;
  for (;;) {
    int ready = 0;
    for (nfds_t i = 0; i < nfds; i++) {
      if (is_emu(fds[i].fd)) { fds[i].revents = 0; continue; }
      struct pollfd one = fds[i]; one.revents = 0;
      if (__real_poll(&one, 1, 0) > 0 && one.revents) { fds[i].revents = one.revents; ready++; }
      else fds[i].revents = 0;
    }
    for (nfds_t i = 0; i < nfds; i++) {
      if (!is_emu(fds[i].fd)) continue;
      int r = poll_emu_ready(&fds[i]);
      fds[i].revents = r;
      if (r) ready++;
    }
    if (ready > 0) return ready;
    if (timeout == 0) return 0;
    if (deadline >= 0 && emscripten_get_now() >= deadline) return 0;
    emscripten_thread_sleep(2);
  }
}

/* ---- read/write/close/readv/writev wraps (fd-routed, same as wsps.c) --------- */
ssize_t __wrap_read(int fd, void *buf, size_t count) {
  if (is_emu(fd)) return __wrap_recv(fd, buf, count, 0);
  return __real_read(fd, buf, count);
}
ssize_t __wrap_write(int fd, const void *buf, size_t count) {
  if (is_emu(fd)) return __wrap_send(fd, buf, count, 0);
  return __real_write(fd, buf, count);
}
int __wrap_close(int fd) {
  if (is_emu(fd)) {
    LOCK();
    Sock *s = sk(fd);
    if (s->conn >= 0) {
      Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
      tx->closed = 1;
      free_conn_if_dead(s->conn);
    }
    s->used = 0;
    UNLOCK();
    return 0;
  }
  return __real_close(fd);
}
ssize_t __wrap_readv(int fd, const struct iovec *iov, int iovcnt) {
  if (!is_emu(fd)) return __real_readv(fd, iov, iovcnt);
  ssize_t total = 0;
  for (int i = 0; i < iovcnt; i++) {
    ssize_t n = __wrap_recv(fd, iov[i].iov_base, iov[i].iov_len, 0);
    if (n < 0) return total ? total : -1;
    total += n;
    if ((size_t)n < iov[i].iov_len) break;
  }
  return total;
}
ssize_t __wrap_writev(int fd, const struct iovec *iov, int iovcnt) {
  if (!is_emu(fd)) return __real_writev(fd, iov, iovcnt);
  ssize_t total = 0;
  for (int i = 0; i < iovcnt; i++) {
    ssize_t n = __wrap_send(fd, iov[i].iov_base, iov[i].iov_len, 0);
    if (n < 0) return total ? total : -1;
    total += n;
    if ((size_t)n < iov[i].iov_len) break;
  }
  return total;
}

/* ============================ browser entry points ============================ */
/* The page is just another loopback peer. These run on the JS main thread and are
 * non-blocking; JS polls emunet_readable() on a timer. Return values: >=0 byte
 * count, -1 with errno EAGAIN when empty. */

EMSCRIPTEN_KEEPALIVE int emunet_connect(uint32_t ip_be, uint16_t port_host) {
  (void)ip_be;
  return emu_open_client(port_host);
}
EMSCRIPTEN_KEEPALIVE int emunet_send(int fd, const uint8_t *buf, int len) {
  if (!is_emu(fd)) { errno = ENOTSOCK; return -1; }
  LOCK();
  Sock *s = sk(fd);
  if (s->conn < 0) { UNLOCK(); errno = ENOTCONN; return -1; }
  Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
  uint32_t n = ring_write(tx, buf, (uint32_t)len);
  UNLOCK();
  return (int)n;
}
EMSCRIPTEN_KEEPALIVE int emunet_recv(int fd, uint8_t *buf, int cap) {
  if (!is_emu(fd)) { errno = ENOTSOCK; return -1; }
  LOCK();
  Sock *s = sk(fd);
  if (s->conn < 0) { UNLOCK(); errno = ENOTCONN; return -1; }
  Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx);
  uint32_t avail = ring_len(rx);
  if (avail == 0) { int eof = rx->closed; UNLOCK(); return eof ? 0 : -1; }
  uint32_t n = ring_read(rx, buf, (uint32_t)cap);
  UNLOCK();
  return (int)n;
}
EMSCRIPTEN_KEEPALIVE int emunet_readable(int fd) {
  if (!is_emu(fd)) return -1;
  LOCK();
  Sock *s = sk(fd);
  int r = -1;
  if (s->conn >= 0) { Ring *rx, *tx; dirs(s->conn, s->end, &rx, &tx); r = (int)ring_len(rx); if (r == 0 && rx->closed) r = -2; }
  UNLOCK();
  return r;   /* >0 bytes ready, 0 none yet, -2 peer closed (EOF), -1 bad fd */
}
EMSCRIPTEN_KEEPALIVE int emunet_close(int fd) { return __wrap_close(fd); }

#endif /* __EMSCRIPTEN__ */
