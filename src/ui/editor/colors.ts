import type { PortKind } from "../../core/model/types";

/** 포트/배선의 매체별 색 (CSS 변수는 styles.css에 정의) */
export const PORT_COLORS: Record<PortKind, string> = {
  pneumatic: "var(--pneumatic)",
  hydraulic: "var(--hydraulic)",
  electric: "var(--electric)",
};
