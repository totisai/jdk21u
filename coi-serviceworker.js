/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT.
 * https://github.com/gzuidhof/coi-serviceworker
 *
 * GitHub Pages cannot set the Cross-Origin-Opener-Policy / Cross-Origin-Embedder-
 * Policy response headers that SharedArrayBuffer (wasm threads) requires. This
 * service worker re-serves every same-origin response with those headers, which
 * makes the page cross-origin isolated so the threaded JVM can boot. It reloads
 * the page once on first visit to take control. */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener('message', (ev) => {
        if (!ev.data) return;
        if (ev.data.type === 'deregister') {
            self.registration.unregister()
                .then(() => self.clients.matchAll())
                .then((clients) => clients.forEach((client) => client.navigate(client.url)));
        } else if (ev.data.type === 'coepCredentialless') {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener('fetch', function (event) {
        const r = event.request;
        if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

        // Only rewrite the DOCUMENT (navigation) to carry COOP/COEP — that alone makes
        // the page cross-origin isolated. Same-origin subresources don't need CORP, so
        // we must NOT proxy them: re-fetching a large asset (the ~80 MB runtime data)
        // through the worker fails in some browsers ("respondWith … Load failed").
        if (r.mode !== 'navigate') return;

        const request = (coepCredentialless && r.mode === 'no-cors')
            ? new Request(r, { credentials: 'omit' })
            : r;
        // Add the isolation headers by rebuilding the response. CRITICAL: never let
        // this resolve to `undefined` — respondWith(undefined) surfaces to the page
        // as "Failed to fetch". If the rebuild throws (it can on large streamed
        // bodies in some browsers), fall back to the untouched response.
        event.respondWith((async () => {
            const response = await fetch(request);   // rejects only on a real network error
            if (response.status === 0) return response;
            try {
                const newHeaders = new Headers(response.headers);
                newHeaders.set('Cross-Origin-Embedder-Policy',
                    coepCredentialless ? 'credentialless' : 'require-corp');
                if (!coepCredentialless) newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
                newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders,
                });
            } catch (_) {
                return response;
            }
        })());
    });
} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
        window.sessionStorage.removeItem('coiReloadedBySelf');
        const coepDegrading = reloadedBySelf === 'coepdegrade';

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record the actual isolation state for pages to read.
        window.sessionStorage.setItem('coiCoep', String(!coepDegrading));

        if (controlling) {
            n.serviceWorker.controller.postMessage({ type: 'coepCredentialless', value: coepDegrading });
        }

        if (!window.crossOriginIsolated && !controlling && window.isSecureContext) {
            if (!n.serviceWorker) {
                console.error('coi: this browser has no service worker support; cross-origin isolation unavailable.');
                return;
            }
            n.serviceWorker.register(window.document.currentScript.src).then(
                (registration) => {
                    registration.addEventListener('updatefound', () => window.location.reload());
                    if (registration.active && !n.serviceWorker.controller) {
                        window.sessionStorage.setItem('coiReloadedBySelf', 'coepdegrade');
                        window.location.reload();
                    }
                },
                (err) => console.error('coi: service worker registration failed:', err)
            );
        }
    })();
}
