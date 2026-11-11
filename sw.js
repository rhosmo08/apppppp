/* Gepestcon Co. - Job Reports: lets the app open with NO internet.
   Upload this file to the website in the SAME folder as index.html (next to gepestcon-logo.png).
   The first time a phone opens the app WITH internet, it keeps a copy of the app. After that the app opens with no signal.
   When there is internet, the newest index.html is always used (and the saved copy is refreshed), so updates still arrive.
   The app's own "is there a new version?" check always asks the internet, never the saved copy, so the "Update required" screen still works. */
const CACHE = 'gepestcon-app-v3';
const NETWORK_WAIT_MS = 4000;   // a slow connection never leaves a phone waiting: after this long the saved copy opens instead
const UPDATE_PARAM = '_u';      // the app adds this to the address while it is updating itself ("Update now"); then the newest copy is waited for

function scopePath(){ return new URL(self.registration.scope).pathname; }
function pageKey(){ return new URL('./index.html', self.registration.scope).href; }

/* a copy of a response that was reached through a redirect cannot be handed to a page opening, so it is rebuilt without that mark */
async function plain(res){
  if(!res.redirected) return res;
  return new Response(await res.blob(), { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html; charset=utf-8' } });
}

self.addEventListener('install', function(event){
  event.waitUntil((async function(){
    const cache = await caches.open(CACHE);
    // The page itself MUST be saved. If it cannot be (no signal right now), this version is not installed at all, so an older saved copy
    // is never thrown away for nothing; the browser simply tries again the next time the app is opened with internet.
    let saved = false;
    for(const u of ['./index.html', './']){
      try{
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if(res && res.ok){ await cache.put(pageKey(), await plain(res)); saved = true; break; }
      }catch(e){}
    }
    if(!saved) throw new Error('The app could not be saved yet.');
    // the logo is a nice extra: a missing one must never stop the app from being saved
    try{ await cache.add(new Request('./gepestcon-logo.png', { cache: 'reload' })); }catch(e){}
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

async function savedPage(){
  const cache = await caches.open(CACHE);
  return (await cache.match(pageKey())) || null;
}

/* opening the app: internet first (so updates arrive), the saved copy when there is none, or when it is too slow */
async function openPage(request){
  const cache = await caches.open(CACHE);
  const updating = new URL(request.url).searchParams.has(UPDATE_PARAM);
  // 'no-cache' = always ask the website whether the page changed (a web host may otherwise hand out a copy up to 10 minutes old)
  const network = fetch(request, { cache: 'no-cache' }).then(function(res){
    if(res && res.ok){ cache.put(pageKey(), res.clone()).catch(function(){}); }   // the address may carry ?_u=... while updating: always saved as index.html
    return res;
  });
  const slow = new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, NETWORK_WAIT_MS); });
  try{
    // while updating, the new version is the whole point: wait for it (the app shows its own "still updating" messages)
    const first = updating ? await network : await Promise.race([network, slow]);
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

/* is this request for the page itself (not for the logo or another file)? */
function isPageUrl(url){
  const base = scopePath();
  return url.pathname === base || url.pathname === base + 'index.html';
}

self.addEventListener('fetch', function(event){
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;                 // the database, fonts and other sites are never touched
  if(url.pathname.endsWith('/sw.js')) return;
  if(req.mode === 'navigate'){ event.respondWith(openPage(req)); return; }
  // The app asks the website "is there a newer version?" by reading the start of its own page. That question (and any partial
  // or "no-store" read) must reach the website, never a saved copy, or a phone could never learn that a new version exists.
  if(isPageUrl(url) || req.cache === 'no-store' || req.cache === 'reload' || req.headers.has('range') || url.searchParams.has('_chk') || url.searchParams.has(UPDATE_PARAM)) return;
  event.respondWith(sameOriginFile(req));
});
