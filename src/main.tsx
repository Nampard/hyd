import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerLibraries } from "./core/library";
import "./styles.css";

registerLibraries();

// PWA: 프로덕션 빌드에서만 서비스 워커 등록 (개발 중 HMR 간섭 방지)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // BASE_URL 기준 등록 — 루트/서브패스(GitHub Pages) 어디서든 동작
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 오프라인 캐시는 부가 기능 — 실패해도 앱은 동작 */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
