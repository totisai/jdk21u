/*
 * WebSocket <-> TCP relay for the wasm JVM's networking.
 *
 * emscripten routes JVM sockets over WebSockets. This bridges those to a real TCP
 * server so Java networking (e.g. Minecraft multiplayer) works. emscripten uses a
 * single configured WebSocket URL for all sockets (it does NOT encode the target
 * per-connection), so this is a SINGLE-TARGET relay: every browser socket is piped
 * to one TCP host:port that you pass on the command line.
 *
 * Usage:  node relay.mjs <targetHost:targetPort> [wsPort=8090]
 * Example (Minecraft server): node relay.mjs my.mc.server:25565
 * Then run the JVM template with websocket.url = ws://localhost:8090/ (the
 * Minecraft template sets this automatically).
 */
import { WebSocketServer } from 'ws';
import net from 'node:net';

const target = process.argv[2] || 'localhost:25565';
const wsPort = parseInt(process.argv[3] || '8090', 10);
const ci = target.lastIndexOf(':');
const thost = target.slice(0, ci), tport = parseInt(target.slice(ci + 1), 10);

const wss = new WebSocketServer({ port: wsPort, handleProtocols: () => 'binary' });
console.log(`relay: ws://localhost:${wsPort}/  <->  tcp://${thost}:${tport}`);

wss.on('connection', (ws) => {
  const tcp = net.connect(tport, thost);
  let open = false; const pending = [];
  tcp.on('connect', () => { open = true; for (const d of pending) tcp.write(d); pending.length = 0;
                            console.log(`[+] ${thost}:${tport} connected`); });
  ws.on('message', (data) => { const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
                               if (open) tcp.write(b); else pending.push(b); });
  tcp.on('data', (d) => { if (ws.readyState === ws.OPEN) ws.send(d); });
  const close = (why) => { if (why) console.log(`[-] closed: ${why}`); try { ws.close(); } catch {} try { tcp.destroy(); } catch {} };
  ws.on('close', () => close());
  ws.on('error', (e) => close('ws ' + e.message));
  tcp.on('close', () => close());
  tcp.on('error', (e) => close('tcp ' + e.message));
});
