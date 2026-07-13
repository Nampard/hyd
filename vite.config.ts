import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 상대 경로 빌드 — GitHub Pages(/hyd/) 등 서브패스 배포 대응
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
});
