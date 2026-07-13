/**
 * HYD 서비스 워커 — 오프라인 실행 (Phase 9).
 * 전략: 네트워크 우선 + 캐시 폴백. 성공한 GET 응답은 캐시에 갱신 저장하므로
 * 한 번 방문한 뒤에는 네트워크 없이 로드된다.
 */
const CACHE = "hyd-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok) cache.put(event.request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        // SPA 네비게이션 폴백
        if (event.request.mode === "navigate") {
          const index = await cache.match("./index.html");
          if (index) return index;
        }
        return Response.error();
      }
    })(),
  );
});
