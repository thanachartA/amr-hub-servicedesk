const CACHE="hub-shell-v1";
self.addEventListener("install",()=>{ self.skipWaiting(); });
self.addEventListener("activate",()=>{ self.clients.claim(); });
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
