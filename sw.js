// Sirve los archivos de la carpeta abierta en el editor bajo /site/...
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith('/site/')) return;
  e.respondWith(serve(u));
});

async function serve(u){
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const app = all.find(c => !new URL(c.url).pathname.startsWith('/site/'));
  if (!app) return new Response('El editor está cerrado.', { status: 503 });
  let path = decodeURIComponent(u.pathname.slice('/site/'.length));
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const ch = new MessageChannel();
  const answer = new Promise(res => {
    ch.port1.onmessage = ev => res(ev.data);
    setTimeout(() => res({ status: 504 }), 15000);
  });
  app.postMessage({ type: 'file', path, edit: u.searchParams.has('__edit') }, [ch.port2]);
  const d = await answer;
  if (d.status !== 200) return new Response('No se encontró: ' + path, { status: d.status || 404 });
  return new Response(d.body, { headers: { 'Content-Type': d.type, 'Cache-Control': 'no-store' } });
}
