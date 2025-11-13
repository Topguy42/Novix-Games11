importScripts('/static/uv/uv.sw.js');

const sw = new self.UVServiceWorker();

self.addEventListener('fetch', (event) => event.respondWith(sw.fetch(event)));
