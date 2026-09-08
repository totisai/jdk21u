/*
 * net.js — a reusable networking abstraction for the wasm JVM.
 *
 * The wasm runtime tunnels real TCP (java.net.Socket / HttpURLConnection, incl. DNS)
 * over ONE WebSocket to a native relay (framework/net/tcp-relay.cjs) that does the
 * actual TCP+DNS. All of that lives in the wasm/C layer (wsps.c + launcher_web.c +
 * Emscripten's websocket.js); the JS side's entire job is small and app-agnostic:
 *
 *   1. RESOLVE a relay ws:// URL from a `network` config (or a host shorthand).
 *   2. SELECT the socket-proxy artifact (that build blocks at boot until a relay
 *      bridge is connected, so it's only chosen when networking is actually on).
 *   3. STAGE the relay URL to /work/bridge — the launcher reads it and calls
 *      emscripten_init_websocket_to_posix_socket_bridge(url) before JNI_CreateJavaVM.
 *   4. optionally PROBE that the relay is reachable, for host UX.
 *
 * This module has no JVM knowledge, so any app that wires networking through the same
 * /work/bridge contract can reuse it.
 */

// Localhost relay used by the `{enabled:true}` / `?net=1` shorthands. Start it with:
//   node wasm-jvm/framework/net/tcp-relay.cjs 8114
export const DEFAULT_RELAY = 'ws://localhost:8114/';

// The control file the launcher reads to find the relay (empty/absent = no networking).
export const BRIDGE_FILE = '/work/bridge';

export const Net = {
  /* Resolve a `network` config into a relay ws:// URL, or null when networking is off.
   *   { relay: 'ws://host:port/' }  — explicit relay
   *   { enabled: true }             — localhost shorthand (DEFAULT_RELAY)
   *   undefined / null              — off */
  resolve(network) {
    if (!network) return null;
    return network.relay || (network.enabled && DEFAULT_RELAY) || null;
  },

  /* Does this config need the socket-proxy artifact tier? (The proxy build blocks at
   * boot without a relay bridge, so callers only load it when networking is on.) */
  needsProxy(network) { return !!Net.resolve(network); },

  /* Parse a host-supplied shorthand (e.g. a `?net=` query param) into a `network`
   * config: '1' -> default relay; 'ws://host:port/' -> that relay; '0'/''/null -> off. */
  fromParam(p) {
    if (!p || p === '0') return undefined;
    return { relay: p === '1' ? DEFAULT_RELAY : p };
  },

  /* Stage the bridge control file the launcher reads, into a MEMFS-path->data map
   * (only when networking is on). Returns the resolved relay URL (or null). */
  stage(files, network) {
    const relay = Net.resolve(network);
    if (relay) files[BRIDGE_FILE] = relay;
    return relay;
  },

  /* Reachability check: open a throwaway WebSocket to the relay and resolve true iff
   * it connects within timeoutMs. Lets a host warn when networking was requested but
   * the relay isn't running (the app would otherwise hang or degrade at first socket).
   * Accepts a relay URL string or a `network` config. */
  probe(relay, timeoutMs = 2500) {
    const url = typeof relay === 'string' ? relay : Net.resolve(relay);
    if (!url || typeof WebSocket === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      let ws, done = false;
      const finish = (ok) => { if (done) return; done = true; try { ws && ws.close(); } catch (_) {} resolve(ok); };
      try { ws = new WebSocket(url); } catch (_) { return resolve(false); }
      const t = setTimeout(() => finish(false), timeoutMs);
      ws.onopen  = () => { clearTimeout(t); finish(true); };
      ws.onerror = () => { clearTimeout(t); finish(false); };
    });
  },
};
