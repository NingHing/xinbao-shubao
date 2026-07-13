/* 并记 · 最小 Service Worker：仅用于可安装，不拦截请求以免手机刷新变慢 */
self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

/* 不调用 event.respondWith：让浏览器自己走网络，主屏幕里刷新会快很多 */
self.addEventListener("fetch", function () {});
