import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import {
  createMpsState,
  mpsInputs,
  parseWorkpieceQueue,
  stepMpsStation,
  MPS_MAGAZINE_MAX,
  type MpsOutputChannel,
  type MpsStationState,
} from "../mps-station";

/**
 * Phase 14-2: MPS 스테이션 물리 상태기계 단위 테스트.
 * PLC 없이 출력 채널을 스크립트로 구동해, 설비가 "물리만" 올바르게
 * 시뮬레이션하는지 검증한다 (래더 연동 골든 테스트는 Phase 14-5).
 */

beforeAll(() => {
  registerLibraries();
});

const DT = 0.02;

function run(
  state: MpsStationState,
  on: MpsOutputChannel[],
  seconds: number,
): void {
  const set = new Set(on);
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepMpsStation(state, (ch) => set.has(ch), DT);
}

describe("매거진 큐 파싱", () => {
  it("금/비 축약과 전체 표기를 인식하고 잘못된 토큰은 무시한다", () => {
    expect(parseWorkpieceQueue("금, 비금속 ,금속,x,비")).toEqual([
      "metal",
      "nonmetal",
      "metal",
      "nonmetal",
    ]);
  });

  it("최대 적재 수를 넘지 않는다", () => {
    const many = new Array(20).fill("금").join(",");
    expect(parseWorkpieceQueue(many)).toHaveLength(MPS_MAGAZINE_MAX);
  });

  it("문자열이 아니면 빈 큐", () => {
    expect(parseWorkpieceQueue(7)).toEqual([]);
  });
});

describe("A실린더 공급 + 판별 센서", () => {
  it("A 전진 완료 시 매거진 → 공급 위치 (판별 센서는 아직 반응 없음 — 벨트 초입 배치)", () => {
    const state = createMpsState({ workpieces: "금,비" });
    expect(mpsInputs(state).매거진).toBe(true);

    run(state, ["A전솔"], 0.7); // 전 행정 0.5s + 여유
    expect(mpsInputs(state).A전센).toBe(true);
    expect(state.supply).toBe("metal");
    expect(state.magazine).toHaveLength(1);
    // 배치도(S3/S4): 판별 센서는 컨베이어 초입에 있어 공급 위치에서는 감지하지 않는다
    expect(mpsInputs(state).용량형).toBe(false);
    expect(mpsInputs(state).유도형).toBe(false);

    run(state, ["A후솔"], 0.7); // 양솔 복귀
    expect(mpsInputs(state).A후센).toBe(true);
  });

  it("판별은 벨트 초입 구간에서: 금속이면 용량형+유도형, 비금속이면 용량형만", () => {
    const metal = createMpsState({ workpieces: "금" });
    run(metal, ["A전솔"], 0.7);
    run(metal, ["A후솔"], 0.7);
    run(metal, ["C전솔"], 0.7); // 벨트 초입 이송
    run(metal, ["컨베이어"], 0.8); // 감지 구간(0.06~0.24) 진입
    expect(mpsInputs(metal).용량형).toBe(true);
    expect(mpsInputs(metal).유도형).toBe(true);

    const nonmetal = createMpsState({ workpieces: "비" });
    run(nonmetal, ["A전솔"], 0.7);
    run(nonmetal, ["A후솔"], 0.7);
    run(nonmetal, ["C전솔"], 0.7);
    run(nonmetal, ["컨베이어"], 0.8);
    expect(mpsInputs(nonmetal).용량형).toBe(true);
    expect(mpsInputs(nonmetal).유도형).toBe(false); // 유도형은 금속만
  });

  it("양솔 임펄스: 전진 1스캔 펄스 후 무신호여도 전진 종단까지 간다 (스풀 메모리)", () => {
    const state = createMpsState({});
    stepMpsStation(state, (ch) => ch === "A전솔", DT); // 1스캔 펄스만
    run(state, [], 1); // 이후 무신호
    expect(state.cyl.A).toBe(1);
  });

  it("양솔 임펄스: 후진 1스캔 펄스 후 무신호여도 후진 종단까지 온다", () => {
    const state = createMpsState({});
    run(state, ["A전솔"], 0.7); // 전진 종단
    stepMpsStation(state, (ch) => ch === "A후솔", DT); // 후진 1스캔 펄스
    run(state, [], 1);
    expect(state.cyl.A).toBe(0);
  });

  it("양솔 임펄스: 양측 동시 여자 시 기존 스풀 방향을 유지한다", () => {
    const state = createMpsState({});
    stepMpsStation(state, (ch) => ch === "A전솔", DT); // 전진 스풀
    run(state, ["A전솔", "A후솔"], 0.3); // 동시 여자 — 전진 유지
    expect(state.cyl.A).toBeGreaterThan(0.5);
    run(state, ["A전솔", "A후솔"], 1);
    expect(state.cyl.A).toBe(1);
  });

  it("양솔 임펄스: 이동 중 반대 펄스가 오면 방향을 전환한다", () => {
    const state = createMpsState({});
    stepMpsStation(state, (ch) => ch === "A전솔", DT);
    run(state, [], 0.3); // 전진 중
    const mid = state.cyl.A;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(1);
    stepMpsStation(state, (ch) => ch === "A후솔", DT); // 반대 펄스
    run(state, [], 0.5);
    expect(state.cyl.A).toBe(0); // 후진 종단
  });

  it("공급 위치가 차 있으면 재전진해도 매거진이 줄지 않는다 (잼 방지)", () => {
    const state = createMpsState({ workpieces: "금,비" });
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    expect(state.supply).toBe("metal");
    run(state, ["A전솔"], 0.7); // supply 점유 중 재전진
    expect(state.magazine).toHaveLength(1); // 그대로
    expect(state.supply).toBe("metal");
  });

  it("빈 매거진: 센서 꺼짐, 전진해도 무변화", () => {
    const state = createMpsState({ workpieces: "금" });
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    expect(mpsInputs(state).매거진).toBe(false);
    run(state, ["A전솔"], 0.7);
    expect(state.supply).toBe("metal"); // 첫 물품 그대로, 추가 공급 없음
  });
});

describe("편솔 스프링 복귀 (B/C/D)", () => {
  it("전솔 OFF면 후진한다", () => {
    const state = createMpsState({});
    run(state, ["B전솔"], 0.7);
    expect(mpsInputs(state).B전센).toBe(true);
    run(state, [], 0.7);
    expect(mpsInputs(state).B후센).toBe(true);
  });
});

describe("C 이송 → 컨베이어 → 분류", () => {
  /** 물품 하나를 공급 위치까지 올려놓는 헬퍼 */
  function supplied(material: string): MpsStationState {
    const state = createMpsState({ workpieces: material });
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    return state;
  }

  it("비금속: D 미작동 → 포토센서 통과 → 컨베이어 끝 저장박스", () => {
    const state = supplied("비");
    run(state, ["C전솔"], 0.7); // 컨베이어 초입으로 이송
    expect(state.supply).toBeNull();
    expect(state.belt).toHaveLength(1);

    run(state, ["컨베이어"], 0.5); // 초입 통과 중
    expect(mpsInputs(state).포토).toBe(true);

    run(state, ["컨베이어"], 7); // 전 구간 6s
    expect(state.belt).toHaveLength(0);
    expect(state.store).toEqual(["nonmetal"]);
    expect(state.eject).toHaveLength(0);
  });

  it("금속: D 전진 상태로 게이트 통과 → 배출박스", () => {
    const state = supplied("금");
    run(state, ["C전솔"], 0.7);
    run(state, ["컨베이어", "D전솔"], 7); // D 게이트 열림 유지
    expect(state.eject).toEqual(["metal"]);
    expect(state.store).toHaveLength(0);
  });

  it("컨베이어 초입이 차 있으면 C가 밀어도 이송되지 않는다 (잼 방지)", () => {
    const state = supplied("금");
    run(state, ["C전솔"], 0.7);
    run(state, [], 0.7); // C 복귀 — 벨트는 멈춰 있어 초입 점유 유지
    // 두 번째 물품을 공급 위치로
    state.magazine = ["nonmetal"];
    run(state, ["A전솔"], 0.7);
    run(state, ["A후솔"], 0.7);
    run(state, ["C전솔"], 0.7); // 초입 점유 중 재이송 시도
    expect(state.belt).toHaveLength(1); // 그대로
    expect(state.supply).toBe("nonmetal"); // 이송 안 됨
  });

  it("컨베이어 OFF면 물품이 이동하지 않는다", () => {
    const state = supplied("비");
    run(state, ["C전솔"], 0.7);
    const before = state.belt[0].progress;
    run(state, [], 2);
    expect(state.belt[0].progress).toBe(before);
  });
});

describe("램프·드릴 (시각 상태)", () => {
  it("램프는 출력 채널을 그대로 반영한다", () => {
    const state = createMpsState({});
    run(state, ["녹램"], DT);
    expect(state.lamps).toEqual({ red: false, yellow: false, green: true });
  });

  it("드릴모터 ON이면 회전각이 진행된다", () => {
    const state = createMpsState({});
    run(state, ["드릴모터"], 0.1);
    expect(state.drillAngle).toBeGreaterThan(0);
  });
});

describe("Phase 14-3: 엔진 ioMap 채널 연동 (PLC ↔ 스테이션)", () => {
  it("PB1 입력 채널 → 래더 → 녹램 출력 채널로 전파된다 (출력 반영 후 다음 틱에 물리 관찰)", async () => {
    const { createEmptyDocument } = await import("../../model/types");
    const { addComponent } = await import("../../model/operations");
    const { rungOf, lc } = await import("../../examples");
    const { SimulationEngine } = await import("../engine");

    let doc = createEmptyDocument("MPS 채널 연동");
    const st = addComponent(doc, "auto.mps-station", { x: 300, y: 300 });
    doc = st.doc;
    const stationId = st.component.id;
    doc = {
      ...doc,
      // 매거진(P0000C)이 있으면 컨베이어(P00016), PB1(P00000)이면 녹램(P00019)
      plcProgram: {
        rungs: [
          rungOf([[lc("no", "P00000"), lc("coil", "P00019")]]),
          rungOf([[lc("no", "P0000C"), lc("coil", "P00016")]]),
        ],
      },
      ioMap: [
        { device: "P00000", direction: "input", componentId: stationId, channel: "PB1" },
        { device: "P0000C", direction: "input", componentId: stationId, channel: "매거진" },
        { device: "P00019", direction: "output", componentId: stationId, channel: "녹램" },
        { device: "P00016", direction: "output", componentId: stationId, channel: "컨베이어" },
      ],
    };
    const engine = new SimulationEngine(doc);

    // PB 안 누름: 녹램 꺼짐. 매거진(기본 금,비,금)은 차 있으므로 컨베이어 가동
    let snap = engine.tick(0.02);
    engine.tick(0.02); // 출력 반영 후 스테이션 물리 1틱 더
    snap = engine.snapshot();
    expect((snap.components[stationId].equipment as MpsStationState | undefined)?.lamps.green).toBe(false);
    const offset1 = (snap.components[stationId].equipment as MpsStationState | undefined)?.beltOffset ?? 0;
    expect(offset1).toBeGreaterThan(0); // 매거진 → 컨베이어 출력 → 벨트 진행

    engine.setDiscreteInput(stationId, "PB1", true); // PB1 누름
    engine.tick(0.02);
    engine.tick(0.02);
    snap = engine.snapshot();
    expect((snap.components[stationId].equipment as MpsStationState | undefined)?.lamps.green).toBe(true);

    engine.setDiscreteInput(stationId, "PB1", false);
    engine.tick(0.02);
    engine.tick(0.02);
    snap = engine.snapshot();
    expect((snap.components[stationId].equipment as MpsStationState | undefined)?.lamps.green).toBe(false);
  });
});

describe("골든 시나리오: MPS 자동운전 (예제 19 — 수업자료 슬라이드 9 LD)", () => {
  /** PB2로 기동 후 지정 시간 실행. pb3At 초에 PB3 펄스(라인변경) 옵션 */
  async function runExample(workpieces: string, seconds: number, pb3At?: number) {
    const { getExample } = await import("../../examples");
    const { SimulationEngine } = await import("../engine");
    const doc = getExample("mps-basic")!.build();
    const station = doc.components.find((c) => c.type === "auto.mps-station")!;
    station.properties.workpieces = workpieces;
    const engine = new SimulationEngine(doc);
    engine.setDiscreteInput(station.id, "PB2", true); // PB2 기동
    for (let i = 0; i < 5; i++) engine.tick(0.02);
    engine.setDiscreteInput(station.id, "PB2", false);
    const steps = Math.round(seconds / 0.02);
    for (let i = 0; i < steps; i++) {
      if (pb3At !== undefined) {
        const t = i * 0.02;
        if (t >= pb3At && t < pb3At + 0.2) engine.setDiscreteInput(station.id, "PB3", true);
        else engine.setDiscreteInput(station.id, "PB3", false);
      }
      engine.tick(0.02);
    }
    return { mps: engine.snapshot().components[station.id].equipment as MpsStationState, engine, stationId: station.id };
  }

  it("금속: A공급 → 판별 → 가공 → 이송 → D실린더가 배출박스로 분류한다", async () => {
    const { mps } = await runExample("금", 12);
    expect(mps.eject).toEqual(["metal"]);
    expect(mps.store).toHaveLength(0);
    expect(mps.belt).toHaveLength(0);
  });

  it("비금속: D 미작동 — 컨베이어 끝 저장박스로 분류한다", async () => {
    const { mps } = await runExample("비", 13);
    expect(mps.store).toEqual(["nonmetal"]);
    expect(mps.eject).toHaveLength(0);
    expect(mps.belt).toHaveLength(0);
  });

  it("금,비: 사이클 후 매거진에 물품이 있으면 자동 재시작(M22), 금1·비1 처리로 종료한다", async () => {
    const { mps } = await runExample("금,비", 22);
    expect(mps.eject).toEqual(["metal"]); // 1사이클: 금속 → 배출박스
    expect(mps.store).toEqual(["nonmetal"]); // 자동 재시작 2사이클: 비금속 → 저장박스
    expect(mps.magazine).toHaveLength(0);
    expect(mps.belt).toHaveLength(0);
  });

  it("PB3 라인변경(M24): 금속이 저장박스로 반전 분류된다", async () => {
    const { mps } = await runExample("금", 14, 0.8); // 판별 직후 PB3
    expect(mps.store).toEqual(["metal"]); // D 미작동 → 컨베이어 끝
    expect(mps.eject).toHaveLength(0);
  });

  it("PB4 일시정지: 누르면 출력 차단·적램 점멸, 떼면(음변환) 초기화된다", async () => {
    const { getExample } = await import("../../examples");
    const { SimulationEngine } = await import("../engine");
    const doc = getExample("mps-basic")!.build();
    const station = doc.components.find((c) => c.type === "auto.mps-station")!;
    const engine = new SimulationEngine(doc);
    engine.setDiscreteInput(station.id, "PB2", true);
    for (let i = 0; i < 5; i++) engine.tick(0.02);
    engine.setDiscreteInput(station.id, "PB2", false);
    for (let i = 0; i < 50; i++) engine.tick(0.02); // 1.1s — 드릴 구간 진입

    engine.setDiscreteInput(station.id, "PB4", true); // PB4 누름 = 일시정지
    for (let i = 0; i < 10; i++) engine.tick(0.02);
    let mps = engine.snapshot().components[station.id].equipment as MpsStationState;
    expect(mps.lamps.red).toBe(true); // 적램 (점멸 위상 초반 ON)
    const pausedB = mps.cyl.B;

    for (let i = 0; i < 25; i++) engine.tick(0.02); // 0.5s 더 정지 유지
    mps = engine.snapshot().components[station.id].equipment as MpsStationState;
    expect(mps.cyl.B).toBeLessThanOrEqual(pausedB); // 전진 차단 (스프링 복귀만)

    engine.setDiscreteInput(station.id, "PB4", false); // 뗌 → 음변환 → M26 초기화
    for (let i = 0; i < 25; i++) engine.tick(0.02);
    const bits = engine.snapshot().plc?.bits ?? {};
    expect(bits.M00010 ?? false).toBe(false); // 기동 자기유지 해제
    expect(bits.M00011 ?? false).toBe(false); // 스텝 체인 리셋
  });
});

describe("예제 19 구조 계약 (codex-review-phase-14 P3)", () => {
  it("래더 32렁 · ioMap 26점(입력16+출력10) · 채널 유일 · serialize→parse 왕복", async () => {
    const { getExample } = await import("../../examples");
    const { parseDocument, serializeDocument } = await import("../../model/schema");
    const doc = getExample("mps-basic")!.build();

    // 32렁
    expect(doc.plcProgram?.rungs).toHaveLength(32);

    // I/O 26점: 입력 16 + 출력 10
    const inputs = doc.ioMap!.filter((e) => e.direction === "input");
    const outputs = doc.ioMap!.filter((e) => e.direction === "output");
    expect(inputs).toHaveLength(16);
    expect(outputs).toHaveLength(10);

    // 채널·디바이스 유일 (배열 순서 의존 없음)
    const channels = doc.ioMap!.map((e) => `${e.direction}:${e.channel}`);
    expect(new Set(channels).size).toBe(channels.length);
    const devices = doc.ioMap!.map((e) => `${e.direction}:${e.device}`);
    expect(new Set(devices).size).toBe(devices.length);

    // serialize → parse 왕복 (경계 검증 통과 + ioMap/channel 보존)
    const parsed = parseDocument(serializeDocument(doc));
    expect(parsed.ok).toBe(true);
    expect(parsed.document?.ioMap).toHaveLength(26);
    expect(parsed.document?.ioMap?.every((e) => e.componentId !== "")).toBe(true);
  });
});

describe("P1-6: 다채널 capability 일반화 정합성", () => {
  it("정의 메타데이터(ioChannels)와 상태기계 채널 목록이 일치한다", async () => {
    const { getComponentDefinition } = await import("../../library/registry");
    const { MPS_INPUT_CHANNELS, MPS_OUTPUT_CHANNELS } = await import("../mps-station");
    const def = getComponentDefinition("auto.mps-station");
    const inChans = def.ioChannels!.filter((c) => c.direction === "input").map((c) => c.id);
    const outChans = def.ioChannels!.filter((c) => c.direction === "output").map((c) => c.id);
    expect(inChans).toEqual([...MPS_INPUT_CHANNELS]);
    expect(outChans).toEqual([...MPS_OUTPUT_CHANNELS]);
  });

  it("복합설비 어댑터가 부품 type으로 등록·조회된다", async () => {
    const { getEquipmentAdapter } = await import("../equipment-adapter");
    await import("../mps-station"); // 등록 side-effect
    const adapter = getEquipmentAdapter("auto.mps-station");
    expect(adapter).toBeDefined();
    // create → setDiscreteInput("PB1") → readInputs가 반영
    const s = adapter!.create({ workpieces: "금" });
    expect(adapter!.readInputs(s).PB1).toBe(false);
    adapter!.setDiscreteInput(s, "PB1", true);
    expect(adapter!.readInputs(s).PB1).toBe(true);
    // 알 수 없는 부품 type은 undefined
    expect(getEquipmentAdapter("pneu.cylinder.double")).toBeUndefined();
  });
});
