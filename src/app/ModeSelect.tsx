import type { ReactElement } from "react";
import { useEditorStore } from "../ui/editor/store";
import { getSymbol } from "../ui/symbols";
import { examples, exampleMode } from "../core/examples";
import { documentMode, type AppMode } from "../core/model/mode";
import { AUTOMATION_IO_CHANNELS } from "../core/library/automation/channels";
import { APP_VERSION } from "./refresh";
import { useI18nStore, useT } from "../ui/i18n";
import stationPhoto from "../ui/equipment/assets/automation-station.webp";

/**
 * 처음 화면 — 작업 모드 고르기 (Phase 37).
 *
 * 실습실에서 "오늘은 어느 장비 앞에 설까"를 고르는 장면으로 그렸다. 왼쪽은 도면지 위의
 * 실제 회로 기호(공유압 회로 모드에서 그리게 될 것), 오른쪽은 그래파이트 위의 스테이션
 * 사진(컨베이어 모드에서 운전하게 될 것)이다. 두 판의 바탕 자체가 두 작업 환경의 차이를
 * 보여 준다. 아래 표제란은 KS 도면 표제란처럼 버전·기호 기준·용도 고지를 칸으로 나눠 적는다.
 */
export function ModeSelect(): ReactElement {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const doc = useEditorStore((s) => s.document);
  const current = documentMode(doc);
  const inProgress = (mode: AppMode) =>
    current === mode && (mode === "conveyor" ? doc.plcProgram?.rungs.length : doc.components.length);
  const count = (mode: AppMode) => examples.filter((e) => exampleMode(e) === mode).length;
  const enter = (mode: AppMode) => {
    const s = useEditorStore.getState();
    // 다른 모드로 가면 지금 문서를 그 모드에서 이어 쓸 수 없어 새 문서로 바뀐다 — 저장 안 한 변경이 있으면 묻는다
    if (documentMode(s.document) !== mode && s.isDirty()) {
      const what = current === "conveyor" ? "컨베이어 과제" : "회로";
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

      {/* 표제란 — 칸마다 실제 정보(버전·기호 기준·용도·저작권)를 담는다 */}
      <footer className="title-block">
        <div>
          <span className="tb-key">{t("tbVersion")}</span>
          <span className="tb-val">{APP_VERSION}</span>
        </div>
        <div>
          <span className="tb-key">{t("tbSymbols")}</span>
          <span className="tb-val">KS B 0054, ISO 1219, KS C IEC 60617</span>
        </div>
        <div className="tb-wide">
          <span className="tb-key">{t("tbUse")}</span>
          <span className="tb-val">{t("tbUseText")}</span>
        </div>
        <div>
          <span className="tb-key">{t("tbRights")}</span>
          <span className="tb-val">© 2026 Nampard</span>
        </div>
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
