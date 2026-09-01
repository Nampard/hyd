import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 화면에 표시할 빌드 식별자 (Phase 19-3).
 * "지금 보고 있는 화면이 어느 버전인지"를 사용자가 바로 확인할 수 있어야
 * PC·브라우저마다 다르게 보이는 문제를 진단할 수 있다. CI에는 .git이 있으므로
 * 커밋 해시를 쓰고, 없으면 시각으로 대체한다.
 */
function resolveBuildVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

/**
 * 서비스 워커 버전 스탬프 (Phase 19).
 *
 * `public/sw.js`는 Vite가 그대로 복사하므로 배포마다 내용이 동일했다. 브라우저는
 * 바이트가 같은 워커를 "변경 없음"으로 보고 새로 설치하지 않아, 한 번 설치된 워커가
 * 계속 살아 있었다. 빌드 산출물 해시로 `__BUILD_ID__`를 치환해 **배포마다 sw.js가
 * 달라지도록** 만들면 브라우저가 업데이트를 감지하고 새 워커를 설치한다.
 */
function swVersionStamp(): Plugin {
  return {
    name: "hyd-sw-version-stamp",
    apply: "build",
    writeBundle(options, bundle) {
      const outDir = options.dir ?? resolve("dist");
      const swPath = resolve(outDir, "sw.js");
      // 산출물 파일명(해시 포함)을 모아 빌드 식별자를 만든다 — 내용이 같으면 값도 같다
      const fingerprint = Object.keys(bundle).sort().join("|");
      const buildId = createHash("sha256").update(fingerprint).digest("hex").slice(0, 12);
      let source: string;
      try {
        source = readFileSync(swPath, "utf8");
      } catch {
        this.warn("dist/sw.js를 찾지 못해 버전 스탬프를 건너뜁니다.");
        return;
      }
      writeFileSync(swPath, source.replaceAll("__BUILD_ID__", buildId));
    },
  };
}

export default defineConfig({
  // 상대 경로 빌드 — GitHub Pages(/hyd/) 등 서브패스 배포 대응
  base: "./",
  plugins: [react(), swVersionStamp()],
  define: { __APP_VERSION__: JSON.stringify(resolveBuildVersion()) },
  server: { port: 5173 },
});
