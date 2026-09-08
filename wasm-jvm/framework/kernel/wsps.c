// Alternative socket system implementation that gets compiled to
// libsockets_proxy.a and included when the `-sPROXY_POSIX_SOCKETS`
// is used.

#include <assert.h>
#include <errno.h>
#include <limits.h>
#include <netdb.h>
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#if defined(__APPLE__) || defined(__linux__)
#include <arpa/inet.h>
#endif

#include <emscripten/console.h>
#include <emscripten/threading.h>
#include <emscripten/websocket.h>
void __wrap_write_fd2(const char*);

// Uncomment to enable debug printing
// #define POSIX_SOCKET_DEBUG

// Uncomment to enable more verbose debug printing (in addition to uncommenting POSIX_SOCKET_DEBUG)
// #define POSIX_SOCKET_DEEP_DEBUG

#define MIN(a,b) (((a)<(b))?(a):(b))

static void *memdup(const void *ptr, size_t sz) {
  if (!ptr) return 0;
  void *dup = malloc(sz);
  if (dup) memcpy(dup, ptr, sz);
  return dup;
}

// Each proxied socket call has at least the following data.
typedef struct SocketCallHeader {
  int callId;
  int function;
} SocketCallHeader;

// Each socket call returns at least the following data.
typedef struct SocketCallResultHeader {
  int callId;
  int ret;
  int errno_;
  // Buffer can contain more data here, conceptually:
  // uint8_t extraData[];
} SocketCallResultHeader;

typedef struct PosixSocketCallResult {
  struct PosixSocketCallResult *next;
  int callId;
  _Atomic uint32_t operationCompleted;

  // Before the call has finished, this field represents the minimum expected
  // number of bytes that server will need to report back.  After the call has
  // finished, this field reports back the number of bytes pointed to by data,
  // >= the expected value.
  int bytes;

  // Result data:
  SocketCallResultHeader *data;
} PosixSocketCallResult;

// Shield multithreaded accesses to POSIX sockets functions in the program,
// namely the two variables 'bridgeSocket' and 'callResultHead' below.
static pthread_mutex_t bridgeLock = PTHREAD_MUTEX_INITIALIZER;

// Socket handle for the connection from browser WebSocket to the sockets bridge
// proxy server.
static EMSCRIPTEN_WEBSOCKET_T bridgeSocket = (EMSCRIPTEN_WEBSOCKET_T)0;

// Stores a linked list of all currently pending sockets operations (ones that
// are waiting for a reply back from the sockets proxy server)
static PosixSocketCallResult *callResultHead = 0;

static PosixSocketCallResult *allocate_call_result(int expectedBytes) {
  pthread_mutex_lock(&bridgeLock); // Guard multithreaded access to 'callResultHead' and 'nextId' below
  PosixSocketCallResult *b = (PosixSocketCallResult*)(malloc(sizeof(PosixSocketCallResult)));
  if (!b) {
#ifdef POSIX_SOCKET_DEBUG
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "allocate_call_result: Failed to allocate call result struct of size %d bytes!\n", (int)sizeof(PosixSocketCallResult));
#endif
    pthread_mutex_unlock(&bridgeLock);
    return 0;
  }
  static int nextId = 1;
  b->callId = nextId++;
#ifdef POSIX_SOCKET_DEEP_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "allocate_call_result: allocated call ID %d\n", b->callId);
#endif
  b->bytes = expectedBytes;
  b->data = 0;
  b->operationCompleted = 0;
  b->next = 0;

  if (!callResultHead) {
    callResultHead = b;
  } else {
    PosixSocketCallResult *t = callResultHead;
    while (t->next) t = t->next;
    t->next = b;
  }
  pthread_mutex_unlock(&bridgeLock);
  return b;
}

static void free_call_result(PosixSocketCallResult *buffer) {
#ifdef POSIX_SOCKET_DEEP_DEBUG
  if (buffer)
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "free_call_result: freed call ID %d\n", buffer->callId);
#endif

  if (buffer->data) free(buffer->data);
  free(buffer);
}

static PosixSocketCallResult *pop_call_result(int callId) {
  pthread_mutex_lock(&bridgeLock); // Guard multithreaded access to 'callResultHead'
  PosixSocketCallResult *prev = 0;
  PosixSocketCallResult *b = callResultHead;
  while (b) {
    if (b->callId == callId) {
      if (prev) prev->next = b->next;
      else callResultHead = b->next;
      b->next = 0;
#ifdef POSIX_SOCKET_DEEP_DEBUG
      emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "pop_call_result: Removed call ID %d from pending sockets call queue\n", callId);
#endif
      pthread_mutex_unlock(&bridgeLock);
      return b;
    }
    prev = b;
    b = b->next;
  }
  pthread_mutex_unlock(&bridgeLock);
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "pop_call_result: No such call ID %d in pending sockets call queue!\n", callId);
#endif
  return 0;
}

static void wait_for_call_result(PosixSocketCallResult *b) {
#ifdef POSIX_SOCKET_DEEP_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "wait_for_call_result: Waiting for call ID %d\n", b->callId);
#endif
  while (!b->operationCompleted) {
    emscripten_futex_wait(&b->operationCompleted, 0, 1e9);
  }
#ifdef POSIX_SOCKET_DEEP_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "wait_for_call_result: Waiting for call ID %d done\n", b->callId);
#endif
}

static EM_BOOL
bridge_socket_on_message(int eventType,
                         const EmscriptenWebSocketMessageEvent* websocketEvent,
                         void* userData) {
  if (websocketEvent->numBytes < sizeof(SocketCallResultHeader)) {
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "Received corrupt WebSocket result message with size %d, not enough space for header, at least %d bytes!\n", (int)websocketEvent->numBytes, (int)sizeof(SocketCallResultHeader));
    return EM_TRUE;
  }

  SocketCallResultHeader *header = (SocketCallResultHeader *)websocketEvent->data;

#ifdef POSIX_SOCKET_DEEP_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "POSIX sockets bridge received message on thread %p, size: %d bytes, for call ID %d\n", (void*)pthread_self(), websocketEvent->numBytes, header->callId);
#endif

  PosixSocketCallResult *b = pop_call_result(header->callId);
  if (!b) {
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "Received WebSocket result message to unknown call ID %d!\n", (int)header->callId);
    // TODO: Craft a socket result that signifies a failure, and wake the listening thread
    return EM_TRUE;
  }

  if (websocketEvent->numBytes < b->bytes) {
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "Received corrupt WebSocket result message with size %d, expected at least %d bytes!\n", (int)websocketEvent->numBytes, b->bytes);
    // TODO: Craft a socket result that signifies a failure, and wake the listening thread
    return EM_TRUE;
  }

  b->bytes = websocketEvent->numBytes;
  b->data = (SocketCallResultHeader*)memdup(websocketEvent->data, websocketEvent->numBytes);

  if (!b->data) {
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "Out of memory, tried to allocate %d bytes!\n", websocketEvent->numBytes);
    return EM_TRUE;
  }

  if (b->operationCompleted != 0) {
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "Memory corruption(?): the received result for completed operation at address %p was expected to be in state 0, but it was at state %d!\n", &b->operationCompleted, (int)b->operationCompleted);
  }

  b->operationCompleted = 1;
  emscripten_futex_wake(&b->operationCompleted, INT_MAX);

  return EM_TRUE;
}

EMSCRIPTEN_WEBSOCKET_T emscripten_init_websocket_to_posix_socket_bridge(const char *bridgeUrl) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_JS_STACK, "emscripten_init_websocket_to_posix_socket_bridge(bridgeUrl=\"%s\")\n", bridgeUrl);
#endif
  pthread_mutex_lock(&bridgeLock); // Guard multithreaded access to 'bridgeSocket'
  if (bridgeSocket) {
#ifdef POSIX_SOCKET_DEBUG
    emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_WARN | EM_LOG_JS_STACK, "emscripten_init_websocket_to_posix_socket_bridge(bridgeUrl=\"%s\"): A previous bridge socket connection handle existed! Forcibly tearing old connection down.\n", bridgeUrl);
#endif
    emscripten_websocket_close(bridgeSocket, 0, 0);
    emscripten_websocket_delete(bridgeSocket);
    bridgeSocket = 0;
  }
  EmscriptenWebSocketCreateAttributes attr;
  emscripten_websocket_init_create_attributes(&attr);
  attr.url = bridgeUrl;
  bridgeSocket = emscripten_websocket_new(&attr);
  emscripten_websocket_set_onmessage_callback_on_thread(bridgeSocket, 0, bridge_socket_on_message, EM_CALLBACK_THREAD_CONTEXT_MAIN_RUNTIME_THREAD);

  pthread_mutex_unlock(&bridgeLock);
  return bridgeSocket;
}

#define POSIX_SOCKET_MSG_SOCKET 1
#define POSIX_SOCKET_MSG_SOCKETPAIR 2
#define POSIX_SOCKET_MSG_SHUTDOWN 3
#define POSIX_SOCKET_MSG_BIND 4
#define POSIX_SOCKET_MSG_CONNECT 5
#define POSIX_SOCKET_MSG_LISTEN 6
#define POSIX_SOCKET_MSG_ACCEPT 7
#define POSIX_SOCKET_MSG_GETSOCKNAME 8
#define POSIX_SOCKET_MSG_GETPEERNAME 9
#define POSIX_SOCKET_MSG_SEND 10
#define POSIX_SOCKET_MSG_RECV 11
#define POSIX_SOCKET_MSG_SENDTO 12
#define POSIX_SOCKET_MSG_RECVFROM 13
#define POSIX_SOCKET_MSG_SENDMSG 14
#define POSIX_SOCKET_MSG_RECVMSG 15
#define POSIX_SOCKET_MSG_GETSOCKOPT 16
#define POSIX_SOCKET_MSG_SETSOCKOPT 17
#define POSIX_SOCKET_MSG_GETADDRINFO 18
#define POSIX_SOCKET_MSG_GETNAMEINFO 19

#define MAX_SOCKADDR_SIZE 256
#define MAX_OPTIONVALUE_SIZE 16

int socket(int domain, int type, int protocol) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "socket(domain=%d,type=%d,protocol=%d) on thread %p\n", domain, type, protocol, (void*)pthread_self());
#endif

  struct {
    SocketCallHeader header;
    int domain;
    int type;
    int protocol;
  } d;

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_SOCKET;
  d.domain = domain;
  d.type = type;
  d.protocol = protocol;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret < 0) errno = b->data->errno_;
  free_call_result(b);
  return ret;
}

int socketpair(int domain, int type, int protocol, int socket_vector[2]) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "socketpair(domain=%d,type=%d,protocol=%d, socket_vector=[%d,%d])\n", domain, type, protocol, socket_vector[0], socket_vector[1]);
#endif

  struct {
    SocketCallHeader header;
    int domain;
    int type;
    int protocol;
  } d;

  typedef struct Result {
    SocketCallResultHeader header;
    int sv[2];
  } Result;

  PosixSocketCallResult *b = allocate_call_result(sizeof(Result));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_SOCKETPAIR;
  d.domain = domain;
  d.type = type;
  d.protocol = protocol;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret == 0) {
    Result *r = (Result*)b->data;
    socket_vector[0] = r->sv[0];
    socket_vector[1] = r->sv[1];
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);
  return ret;
}

int shutdown(int socket, int how) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "shutdown(socket=%d,how=%d)\n", socket, how);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    int how;
  } d;

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_SHUTDOWN;
  d.socket = socket;
  d.how = how;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret != 0) errno = b->data->errno_;
  free_call_result(b);
  return ret;
}

// Remember each bridge socket's bound port so getsockname() (which is answered
// locally, not over the bridge) can report the real port an app bound -- needed
// by localhost servers like IntelliJ's single-instance lock. Ports stored in
// network byte order, indexed by (fd - 1000000).
#define BRIDGE_MAX_SOCKS 65536
static unsigned short g_bound_port[BRIDGE_MAX_SOCKS];

int bind(int socket, const struct sockaddr *address, socklen_t address_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "bind(socket=%d,address=%p,address_len=%d)\n", socket, address, address_len);
#endif

  typedef struct Data {
    SocketCallHeader header;
    int socket;
    uint32_t/*socklen_t*/ address_len;
    uint8_t address[];
  } Data;
  int numBytes = sizeof(Data) + address_len;
  Data *d = (Data*)malloc(numBytes);

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d->header.callId = b->callId;
  d->header.function = POSIX_SOCKET_MSG_BIND;
  d->socket = socket;
  d->address_len = address_len;
  if (address) memcpy(d->address, address, address_len);
  else memset(d->address, 0, address_len);
  emscripten_websocket_send_binary(bridgeSocket, d, numBytes);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret != 0) errno = b->data->errno_;
  free_call_result(b);

  // Record the bound port (network order) so getsockname() can report it.
  if (ret == 0 && address && socket >= 1000000 &&
      (unsigned)(socket - 1000000) < BRIDGE_MAX_SOCKS) {
    const struct sockaddr_in *sin = (const struct sockaddr_in *)address;
    g_bound_port[socket - 1000000] = sin->sin_port;
  }

  free(d);
  return ret;
}

int connect(int socket, const struct sockaddr *address, socklen_t address_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "connect(socket=%d,address=%p,address_len=%d)\n", socket, address, address_len);
#endif

  typedef struct Data {
    SocketCallHeader header;
    int socket;
    uint32_t/*socklen_t*/ address_len;
    uint8_t address[];
  } Data;
  int numBytes = sizeof(Data) + address_len;
  Data *d = (Data*)malloc(numBytes);

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d->header.callId = b->callId;
  d->header.function = POSIX_SOCKET_MSG_CONNECT;
  d->socket = socket;
  d->address_len = address_len;
  if (address) memcpy(d->address, address, address_len);
  else memset(d->address, 0, address_len);
  emscripten_websocket_send_binary(bridgeSocket, d, numBytes);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret != 0) errno = b->data->errno_;
  free_call_result(b);

  free(d);
  return ret;
}

int listen(int socket, int backlog) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "listen(socket=%d,backlog=%d)\n", socket, backlog);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    int backlog;
  } d;

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_LISTEN;
  d.socket = socket;
  d.backlog = backlog;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret != 0) errno = b->data->errno_;
  free_call_result(b);
  return ret;
}

int accept4(int socket, struct sockaddr *address, socklen_t *address_len, int flags) {
  if (flags) {
    abort(); // TODO
  }
  return accept(socket, address, address_len);
}

int accept(int socket, struct sockaddr *address, socklen_t *address_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "accept(socket=%d,address=%p,address_len=%p)\n", socket, address, address_len);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    uint32_t/*socklen_t*/ address_len;
  } d;

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_ACCEPT;
  d.socket = socket;
  d.address_len = address_len ? *address_len : 0;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  typedef struct Result {
    SocketCallResultHeader header;
    int address_len;
    uint8_t address[];
  } Result;

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret == 0) {
    Result *r = (Result*)b->data;
    int realAddressLen = MIN(b->bytes - sizeof(Result), r->address_len);
    int copiedAddressLen = MIN(*address_len, realAddressLen);
    if (address) memcpy(address, r->address, copiedAddressLen);
    if (address_len) *address_len = realAddressLen;
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);
  return ret;
}

int getsockname(int socket, struct sockaddr *address, socklen_t *address_len) {
  if (socket >= 1000000) {
    struct sockaddr_in sin; memset(&sin,0,sizeof(sin));
    unsigned short bp = ((unsigned)(socket - 1000000) < BRIDGE_MAX_SOCKS)
                        ? g_bound_port[socket - 1000000] : 0;
    sin.sin_family = AF_INET; sin.sin_port = bp; sin.sin_addr.s_addr = 0x0100007f;
    unsigned cp = (*address_len < sizeof(sin)) ? *address_len : sizeof(sin);
    if (address) memcpy(address, &sin, cp);
    *address_len = sizeof(sin);
    return 0;
  }
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "getsockname(socket=%d,address=%p,address_len=%p)\n", socket, address, address_len);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    uint32_t/*socklen_t*/ address_len;
  } d;

  typedef struct Result {
    SocketCallResultHeader header;
    int address_len;
    uint8_t address[];
  } Result;

  PosixSocketCallResult *b = allocate_call_result(sizeof(Result));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_GETSOCKNAME;
  d.socket = socket;
  d.address_len = *address_len;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d) + *address_len - MAX_SOCKADDR_SIZE);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret == 0) {
    Result *r = (Result*)b->data;
    int realAddressLen = MIN(b->bytes - sizeof(Result), r->address_len);
    int copiedAddressLen = MIN(*address_len, realAddressLen);
    if (address) memcpy(address, r->address, copiedAddressLen);
    if (address_len) *address_len = realAddressLen;
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);
  return ret;
}

int getpeername(int socket, struct sockaddr* address, socklen_t* address_len) {
  if (socket >= 1000000) {
    struct sockaddr_in sin; memset(&sin,0,sizeof(sin));
    sin.sin_family = AF_INET; sin.sin_port = 0; sin.sin_addr.s_addr = 0x0100007f;
    unsigned cp = (*address_len < sizeof(sin)) ? *address_len : sizeof(sin);
    if (address) memcpy(address, &sin, cp);
    *address_len = sizeof(sin);
    return 0;
  }
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "getpeername(socket=%d,address=%p,address_len=%p)\n", socket, address, address_len);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    uint32_t/*socklen_t*/ address_len;
  } d;

  typedef struct Result {
    SocketCallResultHeader header;
    int address_len;
    uint8_t address[];
  } Result;

  PosixSocketCallResult *b = allocate_call_result(sizeof(Result));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_GETPEERNAME;
  d.socket = socket;
  d.address_len = *address_len;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d) + *address_len - MAX_SOCKADDR_SIZE);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret == 0) {
    Result *r = (Result*)b->data;
    int realAddressLen = MIN(b->bytes - sizeof(Result), r->address_len);
    int copiedAddressLen = MIN(*address_len, realAddressLen);
    if (address) memcpy(address, r->address, copiedAddressLen);
    if (address_len) *address_len = realAddressLen;
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);
  return ret;
}

ssize_t send(int socket, const void *message, size_t length, int flags) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "send(socket=%d,message=%p,length=%zd,flags=%d)\n", socket, message, length, flags);
#endif

  typedef struct MSG {
    SocketCallHeader header;
    int socket;
    uint32_t/*size_t*/ length;
    int flags;
    uint8_t message[];
  } MSG;
  size_t sz = sizeof(MSG)+length;
  MSG *d = (MSG*)malloc(sz);

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d->header.callId = b->callId;
  d->header.function = POSIX_SOCKET_MSG_SEND;
  d->socket = socket;
  d->length = length;
  d->flags = flags;
  if (message) memcpy(d->message, message, length);
  else memset(d->message, 0, length);
  emscripten_websocket_send_binary(bridgeSocket, d, sz);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret < 0) errno = b->data->errno_;
  free_call_result(b);

  free(d);
  return ret;
}

ssize_t recv(int socket, void *buffer, size_t length, int flags) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "recv(socket=%d,buffer=%p,length=%zd,flags=%d)\n", socket, buffer, length, flags);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    uint32_t/*size_t*/ length;
    int flags;
  } d;

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_RECV;
  d.socket = socket;
  d.length = length;
  d.flags = flags;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret >= 0) {
    typedef struct Result {
      SocketCallResultHeader header;
      uint8_t data[];
    } Result;
    Result *r = (Result*)b->data;
    if (buffer) memcpy(buffer, r->data, MIN(ret, length));
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);

  return ret;
}

ssize_t sendto(int socket,
               const void* message,
               size_t length,
               int flags,
               const struct sockaddr* dest_addr,
               socklen_t dest_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "sendto(socket=%d,message=%p,length=%zd,flags=%d,dest_addr=%p,dest_len=%d)\n", socket, message, length, flags, dest_addr, dest_len);
#endif

  typedef struct MSG {
    SocketCallHeader header;
    int socket;
    uint32_t/*size_t*/ length;
    int flags;
    uint32_t/*socklen_t*/ dest_len;
    uint8_t dest_addr[MAX_SOCKADDR_SIZE];
    uint8_t message[];
  } MSG;
  size_t sz = sizeof(MSG)+length;
  MSG *d = (MSG*)malloc(sz);

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d->header.callId = b->callId;
  d->header.function = POSIX_SOCKET_MSG_SENDTO;
  d->socket = socket;
  d->length = length;
  d->flags = flags;
  d->dest_len = dest_len;
  memset(d->dest_addr, 0, sizeof(d->dest_addr));
  if (dest_addr) memcpy(d->dest_addr, dest_addr, dest_len);
  if (message) memcpy(d->message, message, length);
  else memset(d->message, 0, length);
  emscripten_websocket_send_binary(bridgeSocket, d, sz);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret < 0) errno = b->data->errno_;
  free_call_result(b);

  free(d);
  return ret;
}

ssize_t recvfrom(int socket,
                 void* buffer,
                 size_t length,
                 int flags,
                 struct sockaddr* address,
                 socklen_t* address_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "recvfrom(socket=%d,buffer=%p,length=%zd,flags=%d,address=%p,address_len=%p)\n", socket, buffer, length, flags, address, address_len);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    uint32_t/*size_t*/ length;
    int flags;
    uint32_t/*socklen_t*/ address_len;
  } d;

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_RECVFROM;
  d.socket = socket;
  d.length = length;
  d.flags = flags;
  d.address_len = *address_len;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret >= 0) {
    typedef struct Result {
      SocketCallResultHeader header;
      int data_len;
      int address_len; // N.B. this is the reported address length of the sender, that may be larger than what is actually serialized to this message.
      uint8_t data_and_address[];
    } Result;
    Result *r = (Result*)b->data;
    if (buffer) memcpy(buffer, r->data_and_address, MIN(r->data_len, length));
    int copiedAddressLen = MIN((address_len ? *address_len : 0), r->address_len);
    if (address) memcpy(address, r->data_and_address + r->data_len, copiedAddressLen);
    if (address_len) *address_len = r->address_len;
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);

  return ret;
}

ssize_t sendmsg(int socket, const struct msghdr *message, int flags) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "sendmsg(socket=%d,message=%p,flags=%d)\n", socket, message, flags);
#endif

  abort(); // TODO
  return 0;
}

ssize_t recvmsg(int socket, struct msghdr *message, int flags) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "recvmsg(socket=%d,message=%p,flags=%d)\n", socket, message, flags);
#endif

  abort(); // TODO
  return 0;
}

int getsockopt(int socket,
               int level,
               int option_name,
               void* option_value,
               socklen_t* option_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "getsockopt(socket=%d,level=%d,option_name=%d,option_value=%p,option_len=%p)\n", socket, level, option_name, option_value, option_len);
#endif

  struct {
    SocketCallHeader header;
    int socket;
    int level;
    int option_name;
    uint32_t/*socklen_t*/ option_len;
  } d;

  typedef struct Result {
    SocketCallResultHeader header;
    uint8_t option_value[];
  } Result;

  PosixSocketCallResult *b = allocate_call_result(sizeof(Result));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_GETSOCKOPT;
  d.socket = socket;
  d.level = level;
  d.option_name = option_name;
  d.option_len = *option_len;
  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret == 0) {
    Result *r = (Result*)b->data;
    int optLen = b->bytes - sizeof(Result);
    if (option_value) memcpy(option_value, r->option_value, MIN(*option_len, optLen));
    if (option_len) *option_len = optLen;
  } else {
    errno = b->data->errno_;
  }
  free_call_result(b);
  return ret;
}

int setsockopt(int socket,
               int level,
               int option_name,
               const void* option_value,
               socklen_t option_len) {
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "setsockopt(socket=%d,level=%d,option_name=%d,option_value=%p,option_len=%d)\n", socket, level, option_name, option_value, option_len);
#endif

  typedef struct MSG {
    SocketCallHeader header;
    int socket;
    int level;
    int option_name;
    int option_len;
    uint8_t option_value[];
  } MSG;
  int messageSize = sizeof(MSG) + option_len;
  MSG *d = (MSG*)malloc(messageSize);

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader));
  d->header.callId = b->callId;
  d->header.function = POSIX_SOCKET_MSG_SETSOCKOPT;
  d->socket = socket;
  d->level = level;
  d->option_name = option_name;
  if (option_value) memcpy(d->option_value, option_value, option_len);
  else memset(d->option_value, 0, option_len);
  d->option_len = option_len;
  emscripten_websocket_send_binary(bridgeSocket, d, messageSize);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret != 0) errno = b->data->errno_;
  free_call_result(b);

  free(d);
  return ret;
}

// Host name resolution: <netdb.h>

int getaddrinfo(const char* node,
                const char* service,
                const struct addrinfo* hints,
                struct addrinfo** res) {
#define MAX_NODE_LEN 2048
#define MAX_SERVICE_LEN 128

  struct {
    SocketCallHeader header;
    char node[MAX_NODE_LEN]; // Arbitrary max length limit
    char service[MAX_SERVICE_LEN]; // Arbitrary max length limit
    int hasHints;
    int ai_flags;
    int ai_family;
    int ai_socktype;
    int ai_protocol;
  } d;

  typedef struct ResAddrinfo {
    int ai_flags;
    int ai_family;
    int ai_socktype;
    int ai_protocol;
    int/*socklen_t*/ ai_addrlen;
    uint8_t /*sockaddr **/ ai_addr[];
  } ResAddrinfo;

  typedef struct Result {
    SocketCallResultHeader header;
    char ai_canonname[MAX_NODE_LEN];
    int addrCount;
    uint8_t /*ResAddrinfo[]*/ addr[];
  } Result;

  memset(&d, 0, sizeof(d));
  PosixSocketCallResult *b = allocate_call_result(sizeof(Result));
  d.header.callId = b->callId;
  d.header.function = POSIX_SOCKET_MSG_GETADDRINFO;
  if (node) {
    assert(strlen(node) <= MAX_NODE_LEN-1);
    strncpy(d.node, node, MAX_NODE_LEN-1);
  }
  if (service) {
    assert(strlen(service) <= MAX_SERVICE_LEN-1);
    strncpy(d.service, service, MAX_SERVICE_LEN-1);
  }
  d.hasHints = !!hints;
  if (hints) {
    d.ai_flags = hints->ai_flags;
    d.ai_family = hints->ai_family;
    d.ai_socktype = hints->ai_socktype;
    d.ai_protocol = hints->ai_protocol;
  }

#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "getaddrinfo(node=%s,service=%s,hasHints=%d,ai_flags=%d,ai_family=%d,ai_socktype=%d,ai_protocol=%d,hintsPtr=%p,resPtr=%p)\n", node, service, d.hasHints, d.ai_flags, d.ai_family, d.ai_socktype, d.ai_protocol, hints, res);
#endif

  emscripten_websocket_send_binary(bridgeSocket, &d, sizeof(d));

  wait_for_call_result(b);
  int ret = b->data->ret;
#ifdef POSIX_SOCKET_DEBUG
  emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "getaddrinfo finished, ret=%d\n", ret);
#endif
  if (ret == 0) {
    if (res) {
      Result *r = (Result*)b->data;
      uint8_t *raiAddr = (uint8_t*)&r->addr[0];
      struct addrinfo *results = (struct addrinfo*)malloc(sizeof(struct addrinfo)*r->addrCount);
#ifdef POSIX_SOCKET_DEBUG
      emscripten_log(EM_LOG_NO_PATHS | EM_LOG_CONSOLE | EM_LOG_ERROR | EM_LOG_JS_STACK, "%d results\n", r->addrCount);
#endif
      for (size_t i = 0; i < r->addrCount; ++i) {
        ResAddrinfo *rai = (ResAddrinfo*)raiAddr;
        results[i].ai_flags = rai->ai_flags;
        results[i].ai_family = rai->ai_family;
        results[i].ai_socktype = rai->ai_socktype;
        results[i].ai_protocol = rai->ai_protocol;
        results[i].ai_addrlen = rai->ai_addrlen;
        results[i].ai_addr = (struct sockaddr *)malloc(results[i].ai_addrlen);
        memcpy(results[i].ai_addr, rai->ai_addr, results[i].ai_addrlen);
        results[i].ai_canonname = (i == 0) ? strdup(r->ai_canonname) : 0;
        results[i].ai_next = i+1 < r->addrCount ? &results[i+1] : 0;
        raiAddr += sizeof(ResAddrinfo) + rai->ai_addrlen;
      }
      *res = results;
    }
  } else {
    errno = b->data->errno_;
    if (res) *res = 0;
  }
  free_call_result(b);

  return ret;
}

void freeaddrinfo(struct addrinfo *res) {
  for (struct addrinfo *r = res; r; r = r->ai_next) {
    free(r->ai_canonname);
    free(r->ai_addr);
  }
  free(res);
}

int getnameinfo(const struct sockaddr* addr,
                socklen_t addrlen,
                char* host,
                socklen_t hostlen,
                char* serv,
                socklen_t servlen,
                int flags) {
  // TODO
  // POSIX_SOCKET_MSG_GETNAMEINFO
  return -1;
}

// TODO:
// const char *gai_strerror(int);

// ---------------------------------------------------------------------------
// poll() over the bridge. Emscripten's PROXY_POSIX_SOCKETS provides no poll(),
// so JDK's NioSocketImpl (which parks on a poll()-based Poller) would hang. We
// forward poll() to the relay, which knows each socket's readable/writable
// state (including the in-memory socketpair used as the poller self-pipe).
#include <poll.h>
#define POSIX_SOCKET_MSG_POLL 100

int poll(struct pollfd *fds, nfds_t nfds, int timeout) {
  if (!bridgeSocket) { for (nfds_t i = 0; i < nfds; ++i) fds[i].revents = 0; return 0; }

  typedef struct MSG {
    SocketCallHeader header;
    int timeout;
    int nfds;
    // followed by nfds * { int fd; int events; }
  } MSG;
  int msgSize = sizeof(MSG) + (int)nfds * 8;
  MSG *d = (MSG*)malloc(msgSize);
  d->header.function = POSIX_SOCKET_MSG_POLL;
  d->timeout = timeout;
  d->nfds = (int)nfds;
  int *p = (int*)((char*)d + sizeof(MSG));
  for (nfds_t i = 0; i < nfds; ++i) {
    p[i*2]   = fds[i].fd;
    p[i*2+1] = fds[i].events;
    fds[i].revents = 0;
  }

  PosixSocketCallResult *b = allocate_call_result(sizeof(SocketCallResultHeader) + (int)nfds * 4);
  d->header.callId = b->callId;
  emscripten_websocket_send_binary(bridgeSocket, d, msgSize);
  free(d);

  wait_for_call_result(b);
  int ret = b->data->ret;
  if (ret < 0) { errno = b->data->errno_; free_call_result(b); return ret; }
  int *rev = (int*)((char*)b->data + sizeof(SocketCallResultHeader));
  for (nfds_t i = 0; i < nfds; ++i) fds[i].revents = (short)rev[i];
  free_call_result(b);
  return ret;
}

// ---------------------------------------------------------------------------
// read()/write()/close() routing. The JDK does socket I/O via read()/write()
// (not send()/recv()), which Emscripten's PROXY_POSIX_SOCKETS does not override,
// so those calls would hit MEMFS and hang. The relay allocates socket fds in a
// high range (>= BRIDGE_FD_BASE) that never collides with MEMFS fds, so we can
// cheaply route them to send()/recv() and leave file fds to the real syscalls.
#include <sys/uio.h>
#include <string.h>
#define BRIDGE_FD_BASE 1000000

extern ssize_t __real_read(int fd, void *buf, size_t count);
extern ssize_t __real_write(int fd, const void *buf, size_t count);
extern int __real_close(int fd);
extern ssize_t __real_readv(int fd, const struct iovec *iov, int iovcnt);
extern ssize_t __real_writev(int fd, const struct iovec *iov, int iovcnt);

static void trc(const char* s) { __real_write(2, s, strlen(s)); }
ssize_t __wrap_read(int fd, void *buf, size_t count) {
  if (fd >= BRIDGE_FD_BASE) return recv(fd, buf, count, 0);
  return __real_read(fd, buf, count);
}
ssize_t __wrap_write(int fd, const void *buf, size_t count) {
  if (fd >= BRIDGE_FD_BASE) return send(fd, buf, count, 0);
  return __real_write(fd, buf, count);
}
int __wrap_close(int fd) {
  if (fd >= BRIDGE_FD_BASE) { shutdown(fd, SHUT_RDWR); return 0; }
  return __real_close(fd);
}
ssize_t __wrap_readv(int fd, const struct iovec *iov, int iovcnt) {
  if (fd >= BRIDGE_FD_BASE) {
    ssize_t total = 0;
    for (int i = 0; i < iovcnt; ++i) {
      if (iov[i].iov_len == 0) continue;
      ssize_t n = recv(fd, iov[i].iov_base, iov[i].iov_len, 0);
      if (n < 0) return total > 0 ? total : n;
      total += n;
      if ((size_t)n < iov[i].iov_len) break;   // short read: stop
    }
    return total;
  }
  return __real_readv(fd, iov, iovcnt);
}
ssize_t __wrap_writev(int fd, const struct iovec *iov, int iovcnt) {
  if (fd >= BRIDGE_FD_BASE) {
    ssize_t total = 0;
    for (int i = 0; i < iovcnt; ++i) {
      if (iov[i].iov_len == 0) continue;
      ssize_t n = send(fd, iov[i].iov_base, iov[i].iov_len, 0);
      if (n < 0) return total > 0 ? total : n;
      total += n;
      if ((size_t)n < iov[i].iov_len) break;
    }
    return total;
  }
  return __real_writev(fd, iov, iovcnt);
}
void __wrap_write_fd2(const char* s){ __real_write(2, s, strlen(s)); }
