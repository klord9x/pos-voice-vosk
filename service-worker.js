const CACHE_NAME = 'pos-app-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  var url = event.request.url;

  // Never cache the Apps Script API calls — luôn lấy dữ liệu mới nhất (giá, hàng hóa, hóa đơn)
  if(url.indexOf('script.google.com') !== -1 || url.indexOf('script.googleusercontent.com') !== -1){
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: cache-first, fallback network, update cache in background
  event.respondWith(
    caches.match(event.request).then(function(cached){
      var fetchPromise = fetch(event.request).then(function(networkResponse){
        if(networkResponse && networkResponse.ok){
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(function(){ return cached; });
      return cached || fetchPromise;
    })
  );
});
