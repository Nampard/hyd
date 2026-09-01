import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerLibraries } from "./core/library";
import "./styles.css";

registerLibraries();

/**
 * PWA: 프로덕션 빌드에서만 서비스 워커 등록 (개발 중 HMR 간섭 방지).
 *
 * Phase 19 — "다른 PC에서 최신 배포가 안 보인다" 대응:
 * - `updateViaCache: "none"` — sw.js 자체를 HTTP 캐시로 검사하지 않고 항상 서버에
 *   물어본다. 기본값(imports)은 캐시된 워커 스크립트로 갱신 여부를 판단해,
 *   배포 후에도 한참 동안 새 워커를 못 찾는 원인이 된다.
 * - 로드 직후와 탭이 다시 보일 때 `update()` — 수업 중 켜 둔 탭도 갱신을 집어낸다.
 * - 새 워커가 제어를 넘겨받으면(controllerchange) 한 번만 새로고침해 최신 화면으로
 *   교체한다. 학생이 Ctrl+Shift+R을 몰라도 자동으로 최신이 된다.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    // BASE_URL 기준 등록 — 루트/서브패스(GitHub Pages) 어디서든 동작
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => {
        const checkForUpdate = () => void registration.update().catch(() => {});
        checkForUpdate();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        // 대기 중인 새 워커가 있으면 즉시 인계시킨다 (controllerchange → 새로고침)
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              registration.waiting?.postMessage("hyd:skip-waiting");
            }
          });
        });
      })
      .catch(() => {
        /* 오프라인 캐시는 부가 기능 — 실패해도 앱은 동작 */
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
