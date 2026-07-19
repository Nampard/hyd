import type { CircuitDocument, Rotation } from "../model/types";
import { createEmptyDocument } from "../model/types";
import { addComponent, autoWire, canConnect, moveComponent, rerouteAttachedWires } from "../model/operations";
import { summarizeLearningActivity } from "../model/learning-activity";
import type { IoEntry, LadderCell, LadderProgram, VLink } from "../plc/model";
import { LADDER_COLS, isOutputKind } from "../plc/model";

// ---- 래더 조립 헬퍼 ----

export function lc(kind: LadderCell["kind"], device?: string, preset?: number): LadderCell {
  return { kind, device, preset };
}

/** 행 배열을 LADDER_COLS 폭으로 채워 렁 생성. 마지막 요소는 출력 열에 배치하고 사이를 hline으로 잇는다. */
export function rungOf(rows: (LadderCell | null)[][], vlinks: VLink[] = [], id = ""): LadderProgram["rungs"][number] {
  const cells = rows.map((row) => {
    const padded = new Array<LadderCell | null>(LADDER_COLS).fill(null);
    if (row.length === 0) return padded;
    const output = row[row.length - 1];
    const logic = row.slice(0, -1);
    logic.forEach((cell, i) => (padded[i] = cell));
    if (output && isOutputKind(output.kind)) {
      padded[LADDER_COLS - 1] = output;
      // 논리 마지막 셀부터 출력 열까지 hline 채움
      for (let c = logic.length; c < LADDER_COLS - 1; c++) {
        if (padded[c] == null) padded[c] = { kind: "hline" };
      }
    } else if (output) {
      padded[logic.length] = output;
    }
    return padded;
  });
  return { id: id || `rung_${Math.random().toString(36).slice(2, 8)}`, cells, vlinks };
}

/**
 * 내장 예제 조립 빌더. 좌표 하드코딩 대신 core 조작 함수로 조립해
 * 라이브러리 변경(포트 이동 등)에 강하게 유지한다.
 */
export interface Builder {
  place(type: string, x: number, y: number, props?: Record<string, unknown>, rotation?: Rotation): string;
  connect(fromId: string, fromPort: string, toId: string, toPort: string): void;
  setPlc(program: LadderProgram, ioMap: IoEntry[]): void;
  /** 장비 뷰 전용 배치 좌표 (회로도 위치와 별개 — 좁은 장비 캔버스에 맞춰 배치) */
  setEquipment(componentId: string, x: number, y: number): void;
  doc(): CircuitDocument;
}

export function buildCircuit(
  title: string,
  description: string,
  build: (b: Builder) => void,
): CircuitDocument {
  let doc = createEmptyDocument(title);
  doc = { ...doc, meta: { ...doc.meta, description } };

  const builder: Builder = {
    place(type, x, y, props, rotation) {
      const result = addComponent(doc, type, { x, y });
      doc = result.doc;
      const id = result.component.id;
      if (props) {
        doc = {
          ...doc,
          components: doc.components.map((c) =>
            c.id === id ? { ...c, properties: { ...c.properties, ...props } } : c,
          ),
        };
      }
      if (rotation) {
        doc = {
          ...doc,
          components: doc.components.map((c) => (c.id === id ? { ...c, rotation } : c)),
        };
        doc = moveComponent(doc, id, { x, y });
        doc = rerouteAttachedWires(doc, id);
      }
      return id;
    },
    connect(fromId, fromPort, toId, toPort) {
      const from = { componentId: fromId, portId: fromPort };
      const to = { componentId: toId, portId: toPort };
      const check = canConnect(doc, from, to);
      if (!check.ok) {
        throw new Error(`예제 "${title}" 배선 실패 (${fromPort}→${toPort}): ${check.reason}`);
      }
      doc = autoWire(doc, from, to);
    },
    setPlc(program, ioMap) {
      doc = { ...doc, plcProgram: program, ioMap };
    },
    setEquipment(componentId, x, y) {
      doc = {
        ...doc,
        equipmentLayout: { ...(doc.equipmentLayout ?? {}), [componentId]: { x, y } },
      };
    },
    doc: () => doc,
  };

  build(builder);
  const finalDoc = builder.doc();
  // 내장 예제는 교사가 그대로 배포·활용하므로 학습 활동 설명을 자동 채움 (Phase 12)
  return {
    ...finalDoc,
    meta: { ...finalDoc.meta, learningActivity: summarizeLearningActivity(finalDoc) },
  };
}
