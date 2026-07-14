/**
 * HYD 서비스 워커 — 오프라인 실행 (Phase 9, codex-review M1 개선).
 * install 단계에서 앱 셸(index.html + 참조 자산)을 프리캐시해
 * "첫 방문 직후 오프라인"이 보장되도록 한다. 이후에는 네트워크 우선 + 캐시 폴백.
 */
const CACHE = "hyd-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // 앱 셸 프리캐시: index.html을 받아 참조된 스크립트·스타일 자산까지 캐시
        const indexResponse = await fetch("./index.html", { cache: "no-cache" });
        await cache.put("./index.html", indexResponse.clone());
        await cache.put("./", indexResponse.clone());
        const html = await indexResponse.text();
        const assets = new Set(
          [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]),
        );
        assets.add("./manifest.webmanifest");
        assets.add("./icon.svg");
        await Promise.all(
          [...assets].map(async (url) => {
            try {
              const response = await fetch(url, { cache: "no-cache" });
              if (response.ok) await cache.put(url, response);
            } catch {
              /* 개별 자산 실패는 무시 — 런타임 캐시가 보완 */
            }
          }),
        );
      } catch {
        /* 프리캐시 실패해도 설치는 계속 — 런타임 캐시로 동작 */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 같은 오리진의 다른 앱 캐시를 건드리지 않도록 hyd- 접두사만 정리
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("hyd-") && k !== CACHE).map((k) => caches.delete(k)),
      );
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
