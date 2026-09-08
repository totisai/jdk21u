# Giving the wasm JVM a TCP stack — WORKING

The wasm JVM can now open real TCP sockets and make HTTP requests to real
websites. A `java.net.Socket` / `HttpURLConnection` in Java is tunneled over a
single WebSocket to a native relay that performs the actual TCP + DNS.

Verified end-to-end (Node): `HttpURLConnection` GET of `http://example.com/`
returns `HTTP 200`, `Server: cloudflare`, and the page's real HTML body. Raw
`Socket` I/O works too.

## Pieces

- **`tcp-relay.cjs`** — a Node relay (uses the `ws` library, so WebSocket framing /
  control frames are handled correctly) implementing Emscripten's
  websocket_to_posix_proxy wire protocol on top of node `net`/`dns`. It also
  implements a custom `poll` message and an in-memory `socketpair`.
- **`wsps.c`** — a patched copy of Emscripten's `websocket_to_posix_socket.c`
  (overrides the system lib) that adds what the JDK needs:
  - **`poll()` over the bridge** — JDK's NioSocketImpl / selectors poll for
    readiness; the relay answers from each socket's real readable/writable state.
  - **`read`/`write`/`close`/`readv`/`writev` routing** (via `-Wl,--wrap=…`) —
    the JDK does socket I/O with `read()`/`write()`, not `send()`/`recv()`, which
    Emscripten's proxy doesn't handle. Socket fds live in a high range
    (`>= 1000000`) so they never collide with MEMFS fds; those are routed to the
    bridge, everything else to the real syscalls.
  - **`getsockname`/`getpeername` short-circuit** for bridge fds (returns a canned
    local address) — the proxied getsockname RPC hangs, and the local address
    isn't needed for outbound HTTP.
- **`launcher_web.c`** — reads a WebSocket URL from `/work/bridge`, calls
  `emscripten_init_websocket_to_posix_socket_bridge(url)`, and waits for the
  bridge WebSocket to reach OPEN before running Java.

## Build & run

Link the JVM with `-sPROXY_POSIX_SOCKETS -lwebsocket.js`, add `wsps.c` as a source,
and pass `-Wl,--wrap=read -Wl,--wrap=write -Wl,--wrap=close -Wl,--wrap=readv
-Wl,--wrap=writev`. Then:

    node tcp-relay.cjs 8114        # the relay
    # write the bridge URL into MEMFS at /work/bridge, e.g. "ws://localhost:8114/"

Under Node, install `ws` and set `globalThis.WebSocket = require('ws')` before
loading the module (Emscripten creates the bridge WebSocket via the global
`WebSocket`; Node's built-in undici WebSocket does not complete the handshake, but
`ws` does). In a browser the native `WebSocket` is used directly.

## Known rough edges

- A benign `SocketException: Bad file descriptor` can appear at connection
  teardown (a JDK keep-alive/close race) after the full body is read.
- Only plain HTTP is exercised. HTTPS should work (TLS is pure Java over the
  relayed TCP) but needs the cacerts truststore packaged.
- `poll()` is forwarded for all fds; only socket fds are meaningful. Good enough
  for socket selectors, not a general poll.
