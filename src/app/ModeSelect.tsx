import type { ReactElement } from "react";
import { useEditorStore } from "../ui/editor/store";
import { getSymbol } from "../ui/symbols";
import { examples, exampleMode } from "../core/examples";
import { documentMode, type AppMode } from "../core/model/mode";
import { AUTOMATION_IO_CHANNELS } from "../core/library/automation/channels";
import { APP_VERSION } from "./refresh";
import { useI18nStore, useT } from "../ui/i18n";
import stationPhoto from "../ui/equipment/assets/automation-station.webp";

/** 처음 공개한 날 — GitHub Pages 첫 배포 성공 (2026-07-14 07:20 KST) */
const FIRST_RELEASED = "2026-07-14";

/**
 * 처음 화면 — 작업 모드 고르기 (Phase 37).
 *
 * 실습실에서 "오늘은 어느 장비 앞에 설까"를 고르는 장면으로 그렸다. 왼쪽은 도면지 위의
 * 실제 회로 기호(공유압 회로 모드에서 그리게 될 것), 오른쪽은 그래파이트 위의 스테이션
 * 사진(컨베이어 모드에서 운전하게 될 것)이다. 두 판의 바탕 자체가 두 작업 환경의 차이를
 * 보여 준다. 아래 표제란은 도면 오른쪽 아래 구석의 표제란처럼 이름·버전·처음 공개일·기호 기준·저작권을
 * 2단 칸에 적고, 용도 고지는 그 왼쪽에 주의 문구로 둔다.
 */
export function ModeSelect(): ReactElement {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const doc = useEditorStore((s) => s.document);
  const current = documentMode(doc);
  const ladderWritten = (doc.plcProgram?.rungs ?? []).some((r) => r.cells.flat().some((c) => c !== null));
  const inProgress = (mode: AppMode) =>
    current === mode && (mode === "circuit" ? doc.components.length > 0 : ladderWritten);
  const count = (mode: AppMode) => examples.filter((e) => exampleMode(e) === mode).length;
  const enter = (mode: AppMode) => {
    const s = useEditorStore.getState();
    // 다른 모드로 가면 지금 문서를 그 모드에서 이어 쓸 수 없어 새 문서로 바뀐다 — 저장 안 한 변경이 있으면 묻는다
    if (documentMode(s.document) !== mode && s.isDirty()) {
      const what = current === "conveyor" ? "컨베이어 과제" : current === "plc" ? "래더" : "회로";
      if (!window.confirm(`저장하지 않은 ${what}가 있습니다. 버리고 새로 시작할까요?`)) return;
    }
    s.enterMode(mode);
  };

  return (
    <main className="mode-select">
      <header className="mode-select-head">
        <h1>
          <span className="mode-select-mark">HYD</span>
          <span className="mode-select-sub">{t("modeSelectProduct")}</span>
        </h1>
        <button className="mode-select-lang" onClick={() => useI18nStore.getState().toggle()} title="한국어 / English">
          {lang === "ko" ? "English" : "한국어"}
        </button>
      </header>

      <p className="mode-select-question">{t("modeSelectQuestion")}</p>

      <div className="mode-select-benches">
        <button className="bench bench-circuit" onClick={() => enter("circuit")}>
          <span className="bench-tape" aria-hidden="true" />
          <CircuitPreview />
          <span className="bench-text">
            <span className="bench-title">{t("modeCircuit")}</span>
            <span className="bench-desc">{t("modeCircuitDesc")}</span>
            <span className="bench-meta">{t("modeExampleCount").replace("{n}", String(count("circuit")))}</span>
            <span className="bench-cta">{inProgress("circuit") ? t("modeContinue") : t("modeCircuitStart")}</span>
          </span>
        </button>

        <button className="bench bench-plc" onClick={() => enter("plc")}>
          <span className="bench-tape" aria-hidden="true" />
          <LadderPreview />
          <span className="bench-text">
            <span className="bench-title">{t("modePlc")}</span>
            <span className="bench-desc">{t("modePlcDesc")}</span>
            <span className="bench-meta">{t("modeExampleCount").replace("{n}", String(count("plc")))}</span>
            <span className="bench-cta">{inProgress("plc") ? t("modeContinue") : t("modePlcStart")}</span>
          </span>
        </button>

        <button className="bench bench-conveyor" onClick={() => enter("conveyor")}>
          <span className="bench-tape" aria-hidden="true" />
          <span className="bench-photo">
            <img src={stationPhoto} alt="" />
          </span>
          <span className="bench-text">
            <span className="bench-title">{t("modeConveyor")}</span>
            <span className="bench-desc">{t("modeConveyorDesc")}</span>
            <span className="bench-meta">
              {t("modeExampleCount").replace("{n}", String(count("conveyor")))}
              {", "}
              {t("modeIoCount").replace("{n}", String(AUTOMATION_IO_CHANNELS.length))}
            </span>
            <span className="bench-cta">{inProgress("conveyor") ? t("modeContinue") : t("modeConveyorStart")}</span>
          </span>
        </button>
      </div>

      {/* 아래 줄 — 왼쪽은 용도 주의 문구, 오른쪽은 도면 오른쪽 아래 구석의 표제란처럼 2단 칸 */}
      <footer className="mode-select-foot">
        <p className="use-notice">
          <span className="use-notice-key">{t("tbUse")}</span>
          {t("tbUseText")}
        </p>
        <dl className="title-block">
          <div className="tb-name">
            <dt>{t("tbTitle")}</dt>
            <dd>
              <strong>HYD</strong> {t("modeSelectProduct")}
            </dd>
          </div>
          <div>
            <dt>{t("tbVersion")}</dt>
            <dd className="tb-mono">{APP_VERSION}</dd>
          </div>
          <div>
            <dt>{t("tbReleased")}</dt>
            <dd className="tb-mono">
              <time dateTime={FIRST_RELEASED}>{lang === "ko" ? `${FIRST_RELEASED.replaceAll("-", ". ")}.` : FIRST_RELEASED}</time>
            </dd>
          </div>
          <div>
            <dt>{t("tbSymbols")}</dt>
            <dd>KS B 0054, ISO 1219, KS C IEC 60617</dd>
          </div>
          <div>
            <dt>{t("tbRights")}</dt>
            <dd>© 2026 Nampard</dd>
          </div>
        </dl>
      </footer>
    </main>
  );
}

/** 공유압 회로 판의 그림 — 이 모드에서 실제로 쓰는 기호 세 개를 도면지 위에 놓는다 */
function CircuitPreview(): ReactElement {
  const Cylinder = getSymbol("pneu.cylinder.double");
  const Valve = getSymbol("pneu.valve.5-2-double-solenoid");
  const Source = getSymbol("pneu.source");
  return (
    <svg className="bench-drawing" viewBox="-58 14 496 248" aria-hidden="true">
      <defs>
        <pattern id="ms-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="0.8" cy="0.8" r="0.8" fill="var(--grid-dot)" />
        </pattern>
      </defs>
      <rect x="-58" y="14" width="496" height="248" fill="url(#ms-grid)" />
      {/* 배관: 밸브 A·B → 실린더 HEAD·ROD, 공압원 → P */}
      <g fill="none" stroke="var(--pneumatic)" strokeWidth={2}>
        <polyline points="180,108 180,92 160,92 160,70" />
        <polyline points="200,108 200,84 210,84 210,70" />
        <polyline points="190,196 190,168" />
      </g>
      <g color="var(--symbol)">
        <g transform="translate(190,50)">
          <Cylinder properties={{ label: "A" }} />
        </g>
        <g transform="translate(160,138)">
          <Valve properties={{ solenoidLeft: "Y1", solenoidRight: "Y2" }} />
        </g>
        <g transform="translate(190,226)">
          <Source properties={{}} />
        </g>
      </g>
    </svg>
  );
}

/** PLC 래더 판의 그림 — 자기유지 렁 하나를 XG5000식 표기로 (모선·a접점·b접점·코일·병렬 분기) */
function LadderPreview(): ReactElement {
  const ink = "var(--symbol)";
  const contact = (x: number, y: number, nc = false) => (
    <g stroke={ink} strokeWidth={2.2}>
      <line x1={x - 7} y1={y - 9} x2={x - 7} y2={y + 9} />
      <line x1={x + 7} y1={y - 9} x2={x + 7} y2={y + 9} />
      {nc && <line x1={x - 5} y1={y + 9} x2={x + 5} y2={y - 9} />}
    </g>
  );
  const label = (x: number, y: number, text: string) => (
    <text x={x} y={y - 15} fontSize={10} textAnchor="middle" fill="var(--text-dim)">
      {text}
    </text>
  );
  return (
    <svg className="bench-drawing" viewBox="0 0 496 248" aria-hidden="true">
      <defs>
        <pattern id="ms-grid-plc" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="0.8" cy="0.8" r="0.8" fill="var(--grid-dot)" />
        </pattern>
      </defs>
      <rect width="496" height="248" fill="url(#ms-grid-plc)" />
      {/* 좌·우 모선 */}
      <line x1={70} y1={50} x2={70} y2={200} stroke={ink} strokeWidth={3.5} />
      <line x1={426} y1={50} x2={426} y2={200} stroke={ink} strokeWidth={3.5} />
      {/* 렁 0: P00000 ─┤/├ P00001 ─( P00010 ) — 켜진 상태를 초록으로 */}
      <g stroke="var(--run)" strokeWidth={2.2}>
        <line x1={70} y1={100} x2={133} y2={100} />
        <line x1={147} y1={100} x2={213} y2={100} />
        <line x1={227} y1={100} x2={344} y2={100} />
        <line x1={370} y1={100} x2={426} y2={100} />
      </g>
      {contact(140, 100)}
      {contact(220, 100, true)}
      <path d="M 350 91 A 13 13 0 0 0 350 109 M 364 91 A 13 13 0 0 1 364 109" fill="none" stroke="var(--run)" strokeWidth={2.4} />
      {label(140, 100, "P00000")}
      {label(220, 100, "P00001")}
      {label(357, 100, "P00010")}
      {/* 자기유지 병렬: P00010 a접점이 P00000을 건너뛴다 */}
      <g stroke="var(--run)" strokeWidth={2.2}>
        <line x1={70} y1={150} x2={133} y2={150} />
        <line x1={147} y1={150} x2={180} y2={150} />
        <line x1={180} y1={100} x2={180} y2={150} />
      </g>
      {contact(140, 150)}
      {label(140, 150, "P00010")}
    </svg>
  );
}
