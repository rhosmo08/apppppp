/* Gepestcon Co. - Job Reports: lets the app open with NO internet.
   Upload this file to the website in the SAME folder as index.html (next to gepestcon-logo.png).
   The first time a phone opens the app WITH internet, it keeps a copy of the app. After that the app opens with no signal.
   When there is internet, the newest index.html is always used (and the saved copy is refreshed), so updates still arrive. */
const CACHE = 'gepestcon-app-v2';
const CORE = ['./', './index.html', './gepestcon-logo.png'];
const NETWORK_WAIT_MS = 4000;   // a slow connection never leaves a phone waiting: after this long the saved copy opens instead

self.addEventListener('install', function(event){
  event.waitUntil((async function(){
    const cache = await caches.open(CACHE);
    // each file on its own: a missing logo must never stop the app from being saved
    await Promise.all(CORE.map(function(u){ return cache.add(new Request(u, { cache:'reload' })).catch(function(){}); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function(event){
  event.waitUntil((async function(){
    const keys = await caches.keys();
    await Promise.all(keys.filter(function(k){ return k !== CACHE && k.indexOf('gepestcon-') === 0; }).map(function(k){ return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function pageKey(){ return new URL('./index.html', self.registration.scope).href; }

async function savedPage(){
  const cache = await caches.open(CACHE);
  return (await cache.match(pageKey())) || (await cache.match(new URL('./', self.registration.scope).href)) || null;
}

/* opening the app: internet first (so updates arrive), the saved copy when there is none, or when it is too slow */
async function openPage(request){
  const cache = await caches.open(CACHE);
  const network = fetch(request).then(function(res){
    if(res && res.ok){ cache.put(pageKey(), res.clone()).catch(function(){}); }   // the address may carry ?_u=... while updating: always saved as index.html
    return res;
  });
  const slow = new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, NETWORK_WAIT_MS); });
  try{
    const first = await Promise.race([network, slow]);
    if(first) return first;
    const saved = await savedPage();
    if(saved){ network.catch(function(){}); return saved; }   // slow and a saved copy exists: use it (the download carries on and refreshes the copy)
    return await network;
  }catch(err){
    const saved = await savedPage();
    if(saved) return saved;
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;padding:32px;text-align:center"><h2>No internet</h2><p>Open the app once with internet so it can be saved on this phone. After that it opens with no signal.</p></body>', { status: 503, headers: { 'Content-Type':'text/html; charset=utf-8' } });
  }
}

/* files next to the page (logo, icons): saved copy first, refreshed quietly in the background */
async function sameOriginFile(request){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch:true });
  const refresh = fetch(request).then(function(res){ if(res && res.ok) cache.put(request, res.clone()).catch(function(){}); return res; });
  if(hit){ refresh.catch(function(){}); return hit; }
  try{ return await refresh; }
  catch(err){ return new Response('', { status: 504 }); }
}

self.addEventListener('fetch', function(event){
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;                 // the database, fonts and other sites are never touched
  if(url.pathname.endsWith('/sw.js')) return;
  if(req.mode === 'navigate'){ event.respondWith(openPage(req)); return; }
  event.respondWith(sameOriginFile(req));
});
