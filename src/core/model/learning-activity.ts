import type { CircuitDocument } from "./types";
import { getComponentDefinition } from "../library/registry";

/**
 * 학습 활동 설명 자동 초안 생성 (Phase 12).
 *
 * 학생이 과제물을 저장할 때 이 문장이 자동으로 채워져, 교사가 파일만 보고도
 * "어떤 학습 활동인지" 알 수 있게 한다. 저장 전 언제든 직접 수정할 수 있는
 * 초안일 뿐이므로 완벽한 문장을 목표로 하지 않는다.
 *
 * core 규약대로 특정 부품 type 문자열로 분기하지 않고, behavior.role과
 * domain만으로 판정한다 — 새 부품이 추가돼도 이 로직은 손댈 필요가 없다.
 */

/** 문서에서 완전히 제외하는 역할 — 동력원·배기·분기 등 인프라 요소 */
const INFRA_ROLES = new Set<string>([
  "source",
  "exhaust",
  "hydraulic-power-unit",
  "elec-supply",
  "conduit",
]);

/** "주요 부품" 목록에서 우선 노출되는 역할 — 유체 액추에이터·밸브류 */
const FEATURED_ROLES = new Set<string>([
  "valve",
  "cylinder",
  "motor",
  "restrictor",
  "shuttle",
  "two-pressure",
  "quick-exhaust",
  "reducer",
  "pressure-relief",
  "check-valve",
  "pilot-check",
]);

/** elec-load 중 "능동 제어 요소"로 우선 노출되는 디바이스 (표시용 램프/부저/리셋 코일은 후순위) */
const FEATURED_ELEC_DEVICES = new Set<string>(["solenoid", "relay", "timer-on", "timer-off", "counter"]);

type Domain = "pneumatic" | "hydraulic" | "electric";

interface Analysis {
  hasPLC: boolean;
  hasSolenoidValve: boolean;
  hasRollerOrLimit: boolean;
  hasRestrictor: boolean;
  hasRelayLogic: boolean;
  hasLogicValve: boolean;
  domains: Set<Domain>;
  /**
   * 솔레노이드 밸브가 속한 도메인 집합 — "전기공압/전기유압" 판정은 문서 전체 도메인이 아니라
   * 실제 솔레노이드 밸브의 도메인으로 해야 한다 (review P1: 무관한 유압 실린더가 있어도
   * 공압 솔레노이드면 "전기공압"으로 판정)
   */
  solenoidValveDomains: Set<Domain>;
  /** 우선순위별로 분류된, 등장 순서를 보존한 부품 이름 목록 (역할 제외 대상은 미포함) */
  featuredNames: string[];
  secondaryNames: string[];
  counts: Map<string, number>;
}

function analyze(doc: CircuitDocument): Analysis {
  const a: Analysis = {
    hasPLC: (doc.plcProgram?.rungs.length ?? 0) > 0,
    hasSolenoidValve: false,
    hasRollerOrLimit: false,
    hasRestrictor: false,
    hasRelayLogic: false,
    hasLogicValve: false,
    domains: new Set(),
    solenoidValveDomains: new Set(),
    featuredNames: [],
    secondaryNames: [],
    counts: new Map(),
  };
  const seen = new Set<string>();

  for (const comp of doc.components) {
    const def = getComponentDefinition(comp.type);
    a.domains.add(def.domain);
    const behavior = def.behavior;
    if (!behavior) continue;

    if (behavior.role === "valve") {
      if (behavior.left.kind === "solenoid" || behavior.right.kind === "solenoid") {
        a.hasSolenoidValve = true;
        a.solenoidValveDomains.add(def.domain);
      }
      if (behavior.left.kind === "roller" || behavior.right.kind === "roller") {
        a.hasRollerOrLimit = true;
      }
    }
    if (behavior.role === "restrictor") a.hasRestrictor = true;
    if (behavior.role === "shuttle" || behavior.role === "two-pressure") a.hasLogicValve = true;
    if (behavior.role === "elec-contact" && behavior.source === "limit") {
      a.hasRollerOrLimit = true;
    }
    if (
      behavior.role === "elec-load" &&
      ["relay", "timer-on", "timer-off", "counter"].includes(behavior.device)
    ) {
      a.hasRelayLogic = true;
    }

    if (INFRA_ROLES.has(behavior.role)) continue;

    a.counts.set(def.name, (a.counts.get(def.name) ?? 0) + 1);
    if (seen.has(def.name)) continue;
    seen.add(def.name);

    const featured =
      FEATURED_ROLES.has(behavior.role) ||
      (behavior.role === "elec-load" && FEATURED_ELEC_DEVICES.has(behavior.device));
    (featured ? a.featuredNames : a.secondaryNames).push(def.name);
  }

  return a;
}

/** 등장 순서를 보존한 이름 목록을 빈도 내림차순으로 안정 정렬 */
function sortByFrequency(names: string[], counts: Map<string, number>): string[] {
  return [...names].sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0));
}

function controlTypeOf(a: Analysis): string {
  const has = (d: Domain) => a.domains.has(d);

  if (a.hasPLC) return "PLC 제어";
  if (a.hasSolenoidValve) {
    // 솔레노이드 밸브의 실제 도메인으로 판정 — 문서에 무관한 타 도메인 부품이 있어도 오분류하지 않는다
    const solD = a.solenoidValveDomains;
    if (solD.has("hydraulic") && solD.has("pneumatic")) return "전기공유압 시퀀스 제어";
    if (solD.has("hydraulic")) return "전기유압 시퀀스 제어";
    if (solD.has("pneumatic")) return "전기공압 시퀀스 제어";
    return "전기 시퀀스 제어";
  }
  if (a.hasRollerOrLimit) return "시퀀스 제어(자동 왕복)";
  if (a.hasRestrictor) return "속도제어";
  if (a.hasLogicValve) return "논리 회로(OR/AND) 제어";
  if (a.domains.size === 1 && has("electric") && a.hasRelayLogic) return "릴레이 시퀀스 제어";

  if (has("pneumatic") && has("hydraulic")) return "공유압 기초";
  if (has("pneumatic") && has("electric")) return "전기공압 기초";
  if (has("hydraulic") && has("electric")) return "전기유압 기초";
  if (has("pneumatic")) return "공압 기초";
  if (has("hydraulic")) return "유압 기초";
  if (has("electric")) return "전기 기초";
  return "";
}

/** 목록 끝에 붙일 조사(을/를) — 마지막 한글 음절의 종성 유무로 판정. 괄호·기호로
 *  끝나는 이름은 뒤에서부터 첫 한글 음절을 찾아 사용한다 (예: "…(스로틀+체크)"→"체크"). */
function objectParticle(word: string): "을" | "를" {
  for (let i = word.length - 1; i >= 0; i--) {
    const code = word.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      return (code - 0xac00) % 28 !== 0 ? "을" : "를";
    }
  }
  return "를";
}

/** 한국어 나열: "A" / "A 및 B" / "A, B 및 C" */
function formatKoreanList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} 및 ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} 및 ${items[items.length - 1]}`;
}

const MAX_FEATURED_PARTS = 3;

/**
 * 회로 구성에서 학습 활동 설명 문장을 자동으로 초안한다.
 * 부품이 없는 문서나 판정 불가능한 구성이면 빈 문자열을 반환한다.
 */
export function summarizeLearningActivity(doc: CircuitDocument): string {
  if (doc.components.length === 0) return "";

  const a = analyze(doc);
  const controlType = controlTypeOf(a);
  if (!controlType) return "";

  const ranked = [
    ...sortByFrequency(a.featuredNames, a.counts),
    ...sortByFrequency(a.secondaryNames, a.counts),
  ];
  const featured = ranked.slice(0, MAX_FEATURED_PARTS);

  if (featured.length === 0) return `${controlType} 회로 구현`;

  const list = formatKoreanList(featured);
  const particle = objectParticle(featured[featured.length - 1]);
  return `${list}${particle} 활용한 ${controlType} 회로 구현`;
}
