import type { CircuitDocument } from "../core/model/types";
import {
  MAX_JSON_BYTES,
  parseDocument,
  prepareDocumentForPersistence,
  serializeDocument,
} from "../core/model/schema";

/** 문서를 .json 파일로 다운로드 (저장 경계를 거쳐 항상 재열기 가능한 형태로 직렬화) */
export function downloadDocument(doc: CircuitDocument): void {
  const prepared = prepareDocumentForPersistence(doc);
  const blob = new Blob([serializeDocument(prepared)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.meta.title || "circuit"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 회로도 캔버스를 인쇄용 SVG 파일로 내보내기 */
export function exportCircuitSvg(title = "circuit"): void {
  const svg = document.querySelector<SVGSVGElement>(".editor-canvas");
  const world = svg?.querySelector("g");
  if (!svg || !world) return;

  const bbox = (world as SVGGElement).getBBox();
  if (bbox.width === 0 && bbox.height === 0) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('rect[fill="url(#grid)"]').forEach((el) => el.remove());
  clone.querySelector("g")?.removeAttribute("transform");
  const pad = 24;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute(
    "viewBox",
    `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
  );
  clone.setAttribute("width", String(bbox.width + pad * 2));
  clone.setAttribute("height", String(bbox.height + pad * 2));
  clone.removeAttribute("class");
  // 독립 파일에서 CSS 변수 해석되도록 값 인라인
  clone.setAttribute(
    "style",
    "--symbol:#1d2430;--accent:#2563eb;--ok:#16a34a;--err:#dc2626;--canvas-bg:#ffffff;" +
      "--pneumatic:#0284c7;--hydraulic:#b45309;--electric:#dc2626;" +
      "--flow-pressurized:#0369a1;--flow-exhaust:#93bcd9;--flow-blocked:#a3adba;" +
      "--energized:#fecaca;--lamp-on:#fde047;background:#ffffff;",
  );

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface OpenFileResult {
  ok: boolean;
  document?: CircuitDocument;
  error?: string;
  /** 사용자가 대화상자를 취소함 — 오류 아님 (codex-review L2) */
  cancelled?: boolean;
}

/** 파일 선택 대화상자를 열어 문서를 읽는다. 취소 시에도 반드시 완료된다 */
export function openDocumentFile(): Promise<OpenFileResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    let settled = false;
    /** change 도착 표시 — 큰 파일의 text() 읽기 중 포커스 폴백이 취소로 오판하지 않게 (review-2 P1) */
    let chosen = false;
    const settle = (result: OpenFileResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    input.onchange = async () => {
      chosen = true;
      const file = input.files?.[0];
      if (!file) {
        settle({ ok: false, cancelled: true });
        return;
      }
      // 전체 읽기 전에 파일 크기부터 검사 — 초대형 파일의 메모리 낭비 방지 (review-3 P1)
      if (file.size > MAX_JSON_BYTES) {
        settle({ ok: false, error: "파일이 너무 큽니다 (5MB 초과)." });
        return;
      }
      try {
        const text = await file.text();
        settle(parseDocument(text));
      } catch {
        settle({ ok: false, error: "파일을 읽지 못했습니다." });
      }
    };
    // 최신 브라우저의 취소 이벤트 + 포커스 복귀 폴백
    input.addEventListener("cancel", () => settle({ ok: false, cancelled: true }));
    window.addEventListener(
      "focus",
      () => {
        // 대화상자가 닫힌 뒤 change가 오지 않으면 취소로 간주
        setTimeout(() => {
          if (!chosen) settle({ ok: false, cancelled: true });
        }, 1000);
      },
      { once: true },
    );
    input.click();
  });
}
