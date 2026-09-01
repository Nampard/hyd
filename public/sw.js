/**
 * HYD 서비스 워커 — 오프라인 실행 (Phase 9, codex-review M1 개선).
 * install 단계에서 앱 셸(index.html + 참조 자산)을 프리캐시해
 * "첫 방문 직후 오프라인"이 보장되도록 한다.
 *
 * v5 (Phase 19): "다른 PC에서 최신 배포가 반영되지 않는" 문제 해소.
 *
 * 원인 세 가지를 함께 고쳤다.
 * 1) **워커가 갱신되지 않음** — sw.js 내용이 배포마다 동일해 브라우저가 새 워커를
 *    설치하지 않았다. 빌드가 `__BUILD_ID__`를 산출물 해시로 치환해 매 배포마다
 *    파일이 달라지게 했다 (vite.config.ts의 swVersionStamp).
 * 2) **앱 셸이 낡은 채로 고정** — index.html을 HTTP 캐시가 섞인 network-first로
 *    받았고, 네트워크가 느리면 4초 타임아웃으로 캐시 사본을 돌려줬다. 그 결과 느린
 *    학교망에서는 오래된 셸이 계속 나오고, 셸이 낡으면 새 해시 자산을 아예 요청하지
 *    않아 영구히 옛 버전에 묶였다. 이제 셸은 `cache: "no-store"`로 **항상 새로**
 *    받고, 캐시는 네트워크가 **실패했을 때만** 쓴다.
 * 3) **해시 자산 처리** — 파일명에 내용 해시가 있어 불변이므로 cache-first로 즉시
 *    응답하고 백그라운드 갱신도 필요 없다. 셸만 최신이면 항상 올바른 자산을 가리킨다.
 */
const BUILD_ID = "__BUILD_ID__";
const CACHE = `hyd-${BUILD_ID}`;

/** 셸 요청이 네트워크에서 매달릴 때 캐시로 넘어가는 한계 시간 (오프라인 판정용) */
const SHELL_TIMEOUT_MS = 8000;

/** 내용 해시가 붙은 불변 자산인지 — Vite는 assets/이름-해시.확장자 로 낸다 */
function isHashedAsset(url) {
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(url.pathname);
}

/** 앱 셸(내비게이션 또는 index.html) 요청인지 */
function isShellRequest(request, url) {
  if (request.mode === "navigate") return true;
  return url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
}

async function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(request, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // 앱 셸 프리캐시는 원자적으로: 셸 자산 중 하나라도 실패하면 설치를 실패시켜
      // 반쪽짜리 셸이 캐시되는 일을 막는다 — 이전 SW/캐시가 그대로 유지된다 (review-2 P1)
      const indexResponse = await fetch("./index.html", { cache: "no-store" });
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
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error(`프리캐시 실패: ${url}`);
          return [url, response];
        }),
      );
      const cache = await caches.open(CACHE);
      await cache.put("./index.html", indexResponse.clone());
      await cache.put("./", indexResponse);
      await Promise.all(fetched.map(([url, response]) => cache.put(url, response)));
      // 새 배포를 기다리지 않고 즉시 인계 — 페이지 쪽에서 controllerchange로 새로고침한다
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 같은 오리진의 다른 앱 캐시를 건드리지 않도록 hyd- 접두사만 정리.
      // 빌드마다 캐시 이름이 달라지므로 이전 배포 캐시가 여기서 사라진다.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("hyd-") && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** 페이지가 즉시 갱신을 요청할 때 (설정 메뉴의 "최신 버전으로 갱신") */
self.addEventListener("message", (event) => {
  if (event.data === "hyd:skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // 1) 해시 자산: 내용 불변 → 캐시 우선 (오프라인·저속망에서 즉시 응답)
  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const fresh = await fetch(event.request);
        if (fresh.ok) cache.put(event.request, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // 2) 앱 셸: 항상 최신을 받는다. HTTP 캐시를 건너뛰고(no-store), 네트워크가
  //    실패하거나 매달릴 때만 캐시 사본으로 폴백한다 (오프라인 지원 유지).
  if (isShellRequest(event.request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetchWithTimeout(
            new Request(event.request.url, { cache: "no-store", credentials: "same-origin" }),
            SHELL_TIMEOUT_MS,
          );
          if (fresh.ok) {
            cache.put("./index.html", fresh.clone());
            cache.put("./", fresh.clone());
            return fresh;
          }
          const cached = (await cache.match("./index.html")) ?? (await cache.match("./"));
          return cached ?? fresh;
        } catch {
          const cached = (await cache.match("./index.html")) ?? (await cache.match("./"));
          if (cached) return cached;
          return Response.error();
        }
      })(),
    );
    return;
  }

  // 3) 그 밖의 정적 파일(매니페스트·아이콘 등): 네트워크 우선 + 캐시 폴백
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok) {
          cache.put(event.request, fresh.clone());
          return fresh;
        }
        const cached = await cache.match(event.request);
        return cached ?? fresh;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        return Response.error();
      }
    })(),
  );
});
