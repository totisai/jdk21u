#!/usr/bin/env python3
# Serves the wasm JVM with COOP/COEP headers so SharedArrayBuffer (and thus
# Emscripten pthreads) is available in the browser.
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8113

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def guess_type(self, path):
        if path.endswith('.wasm'): return 'application/wasm'
        if path.endswith('.js'):   return 'text/javascript'
        if path.endswith('.data'): return 'application/octet-stream'
        return super().guess_type(path)

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'serving on http://127.0.0.1:{PORT}')
    httpd.serve_forever()
