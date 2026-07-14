/**
 * HYD 서비스 워커 — 오프라인 실행 (Phase 9, codex-review M1 개선).
 * install 단계에서 앱 셸(index.html + 참조 자산)을 프리캐시해
 * "첫 방문 직후 오프라인"이 보장되도록 한다. 이후에는 네트워크 우선 + 캐시 폴백.
 */
const CACHE = "hyd-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // 앱 셸 프리캐시는 원자적으로: 셸 자산 중 하나라도 실패하면 설치를 실패시켜
      // 반쪽짜리 셸이 캐시되는 일을 막는다 — 이전 SW/캐시가 그대로 유지된다 (review-2 P1)
      const indexResponse = await fetch("./index.html", { cache: "no-cache" });
      if (!indexResponse.ok) throw new Error("index.html 프리캐시 실패");
      const html = await indexResponse.clone().text();
      const assets = new Set(
        [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]),
      );
      assets.add("./manifest.webmanifest");
      assets.add("./icon.svg");
      // 모든 자산을 먼저 받아 성공을 확인한 뒤에야 캐시에 기록한다
      const fetched = await Promise.all(
        [...assets].map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (!response.ok) throw new Error(`프리캐시 실패: ${url}`);
          return [url, response];
        }),
      );
      const cache = await caches.open(CACHE);
      await cache.put("./index.html", indexResponse.clone());
      await cache.put("./", indexResponse);
      await Promise.all(fetched.map(([url, response]) => cache.put(url, response)));
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
