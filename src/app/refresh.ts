/**
 * 강제 갱신 (Phase 19-3).
 *
 * "새로고침을 눌러도 옛 화면이 나온다", "PC·브라우저마다 보이는 게 다르다"에 대한
 * **확실한 탈출구**. 브라우저마다 강력 새로고침 동작이 달라(특히 Safari는 단축키로
 * 서비스 워커를 우회하지 않는다) 사용자가 스스로 해결하기 어렵다.
 *
 * 이 함수는 브라우저에 의존하지 않고 세 가지를 직접 수행한다.
 * 1. 등록된 서비스 워커를 모두 해제 — 낡은 워커가 응답을 가로채지 못하게
 * 2. Cache Storage를 전부 비움 — 옛 셸·자산 사본 제거
 * 3. 캐시 무효화 쿼리를 붙여 재접속 — HTTP 캐시까지 우회한 새 요청
 */
export const APP_VERSION: string = __APP_VERSION__;

export async function forceRefreshToLatest(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    /* 워커 해제 실패해도 나머지 단계는 진행한다 */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* 캐시 삭제 실패해도 재접속은 시도한다 */
  }
  const url = new URL(window.location.href);
  // 매번 다른 값이라 HTTP 캐시·CDN 사본을 확실히 건너뛴다
  url.searchParams.set("v", Date.now().toString(36));
  window.location.replace(url.toString());
}
