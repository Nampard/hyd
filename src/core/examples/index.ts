import type { CircuitDocument, Rotation } from "../model/types";
import { createEmptyDocument } from "../model/types";
import { addComponent, autoWire, canConnect, moveComponent, rerouteAttachedWires } from "../model/operations";
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
 * 내장 예제 회로. 좌표 하드코딩 대신 core 조작 함수로 조립해
 * 라이브러리 변경(포트 이동 등)에 강하게 유지한다.
 */

interface Builder {
  place(type: string, x: number, y: number, props?: Record<string, unknown>, rotation?: Rotation): string;
  connect(fromId: string, fromPort: string, toId: string, toPort: string): void;
  setPlc(program: LadderProgram, ioMap: IoEntry[]): void;
  doc(): CircuitDocument;
}

function buildCircuit(title: string, description: string, build: (b: Builder) => void): CircuitDocument {
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
    doc: () => doc,
  };

  build(builder);
  return builder.doc();
}

export type ExampleCategory = "공압 기초" | "전기공압" | "유압" | "PLC" | "자격증 유형";

export interface ExampleEntry {
  id: string;
  name: string;
  category: ExampleCategory;
  build(): CircuitDocument;
}

export const examples: ExampleEntry[] = [
  {
    id: "direct-single",
    category: "공압 기초",
    name: "1. 직접 제어 — 단동 실린더",
    build: () =>
      buildCircuit(
        "직접 제어 (단동 실린더)",
        "3/2 푸시버튼 밸브로 단동 실린더를 직접 제어한다. 버튼을 누르면 전진, 놓으면 스프링 복귀.",
        (b) => {
          const cyl = b.place("pneu.cylinder.single", 400, 120);
          const valve = b.place("pneu.valve.3-2-manual", 400, 300);
          const src = b.place("pneu.source", 400, 460);
          b.connect(src, "P", valve, "P");
          b.connect(valve, "A", cyl, "HEAD");
        },
      ),
  },
  {
    id: "direct-double",
    category: "공압 기초",
    name: "2. 직접 제어 — 복동 실린더 (5/2 레버)",
    build: () =>
      buildCircuit(
        "직접 제어 (복동 실린더)",
        "5/2 레버 밸브로 복동 실린더를 제어한다. 레버를 토글하면 전진/후진이 전환된다.",
        (b) => {
          const cyl = b.place("pneu.cylinder.double", 400, 120);
          const valve = b.place("pneu.valve.5-2-manual", 400, 300);
          const src = b.place("pneu.source", 430, 460);
          b.connect(src, "P", valve, "P");
          b.connect(valve, "A", cyl, "HEAD");
          b.connect(valve, "B", cyl, "ROD");
        },
      ),
  },
  {
    id: "speed-control",
    category: "공압 기초",
    name: "3. 속도 제어 (미터아웃)",
    build: () =>
      buildCircuit(
        "속도 제어 (미터아웃)",
        "속도제어밸브로 실린더 배기측을 교축해 전·후진 속도를 조절한다. 개도(0.05~1)를 바꿔 보세요.",
        (b) => {
          const cyl = b.place("pneu.cylinder.double", 400, 100);
          // rotation 270: A 아래, B 위 — 실린더에서 나가는 공기(B→A)가 교축된다
          const sc1 = b.place("pneu.speed-controller", 370, 190, { openness: 0.3 }, 270);
          const sc2 = b.place("pneu.speed-controller", 450, 190, { openness: 0.3 }, 270);
          const valve = b.place("pneu.valve.5-2-manual", 400, 330);
          const src = b.place("pneu.source", 430, 480);
          b.connect(src, "P", valve, "P");
          b.connect(sc1, "B", cyl, "HEAD");
          b.connect(sc1, "A", valve, "A");
          b.connect(sc2, "B", cyl, "ROD");
          b.connect(sc2, "A", valve, "B");
        },
      ),
  },
  {
    id: "or-circuit",
    category: "공압 기초",
    name: "4. OR 회로 (셔틀밸브)",
    build: () =>
      buildCircuit(
        "OR 회로 (셔틀밸브)",
        "두 버튼 중 어느 쪽을 눌러도 실린더가 전진한다.",
        (b) => {
          const cyl = b.place("pneu.cylinder.single", 400, 110);
          const shuttle = b.place("pneu.shuttle", 400, 230);
          const v1 = b.place("pneu.valve.3-2-manual", 250, 340);
          const v2 = b.place("pneu.valve.3-2-manual", 550, 340);
          const tee = b.place("pneu.tee", 400, 440);
          const src = b.place("pneu.source", 400, 530);
          b.connect(shuttle, "A", cyl, "HEAD");
          b.connect(v1, "A", shuttle, "X1");
          b.connect(v2, "A", shuttle, "X2");
          b.connect(src, "P", tee, "3");
          b.connect(tee, "1", v1, "P");
          b.connect(tee, "2", v2, "P");
        },
      ),
  },
  {
    id: "and-circuit",
    category: "공압 기초",
    name: "5. AND 회로 (2압밸브)",
    build: () =>
      buildCircuit(
        "AND 회로 (2압밸브)",
        "두 버튼을 동시에 눌러야 실린더가 전진한다 (양수 조작 안전 회로의 기본형).",
        (b) => {
          const cyl = b.place("pneu.cylinder.single", 400, 110);
          const and = b.place("pneu.two-pressure", 400, 230);
          const v1 = b.place("pneu.valve.3-2-manual", 250, 340);
          const v2 = b.place("pneu.valve.3-2-manual", 550, 340);
          const tee = b.place("pneu.tee", 400, 440);
          const src = b.place("pneu.source", 400, 530);
          b.connect(and, "A", cyl, "HEAD");
          b.connect(v1, "A", and, "X1");
          b.connect(v2, "A", and, "X2");
          b.connect(src, "P", tee, "3");
          b.connect(tee, "1", v1, "P");
          b.connect(tee, "2", v2, "P");
        },
      ),
  },
  {
    id: "indirect-pilot",
    category: "공압 기초",
    name: "6. 간접 제어 (파일럿)",
    build: () =>
      buildCircuit(
        "간접 제어 (파일럿)",
        "작은 3/2 버튼 밸브의 출력이 5/2 편측 파일럿 밸브를 전환해 실린더를 제어한다.",
        (b) => {
          const cyl = b.place("pneu.cylinder.double", 450, 120);
          const main = b.place("pneu.valve.5-2-single-pilot", 450, 300);
          const pilotBtn = b.place("pneu.valve.3-2-manual", 180, 300);
          const tee = b.place("pneu.tee", 330, 430);
          const src = b.place("pneu.source", 330, 520);
          b.connect(main, "A", cyl, "HEAD");
          b.connect(main, "B", cyl, "ROD");
          b.connect(pilotBtn, "A", main, "X");
          b.connect(src, "P", tee, "3");
          b.connect(tee, "1", pilotBtn, "P");
          b.connect(tee, "2", main, "P");
        },
      ),
  },
  {
    id: "auto-reciprocate",
    category: "공압 기초",
    name: "7. A+A− 자동 왕복 (롤러 + 임펄스)",
    build: () =>
      buildCircuit(
        "A+A− 자동 왕복",
        "시작 레버를 켜면 실린더 A가 자동 왕복한다. 후진단 롤러(S1)→전진, 전진단 롤러(S2)→후진. 5/2 양측 파일럿 밸브가 신호를 기억한다.",
        (b) => {
          const cyl = b.place("pneu.cylinder.double", 450, 110, { label: "A" });
          const main = b.place("pneu.valve.5-2-double-pilot", 450, 290);
          const s1 = b.place("pneu.valve.3-2-roller", 220, 290, {
            cylinderLabel: "A",
            triggerAt: "retracted",
          });
          const start = b.place("pneu.valve.3-2-manual", 160, 450, { actuation: "lever" });
          const s2 = b.place("pneu.valve.3-2-roller", 660, 450, {
            cylinderLabel: "A",
            triggerAt: "extended",
          });
          const tee1 = b.place("pneu.tee", 450, 430);
          const tee2 = b.place("pneu.tee", 330, 510);
          const src = b.place("pneu.source", 450, 560);

          b.connect(main, "A", cyl, "HEAD");
          b.connect(main, "B", cyl, "ROD");
          b.connect(s1, "A", main, "X"); // 후진단 감지 → 전진
          b.connect(s2, "A", main, "Y"); // 전진단 감지 → 후진
          b.connect(start, "A", s1, "P"); // 시작 레버가 S1에 급기 (자동 사이클 온/오프)

          b.connect(src, "P", tee1, "3");
          b.connect(tee1, "2", main, "P");
          b.connect(tee1, "1", tee2, "2");
          b.connect(tee2, "1", start, "P");
          b.connect(tee2, "3", s2, "P");
        },
      ),
  },
  {
    id: "self-holding",
    category: "전기공압",
    name: "8. 자기유지 회로 (릴레이)",
    build: () =>
      buildCircuit(
        "자기유지 회로",
        "START를 누르면 릴레이 K1이 자신의 접점으로 자기유지되어 램프가 켜진다. STOP(b접점)으로 해제.",
        (b) => {
          const sup24 = b.place("elec.supply-24v", 250, 100);
          const stop = b.place("elec.pushbutton", 250, 180, { contactType: "NC", name: "STOP" });
          const start = b.place("elec.pushbutton", 250, 280, { contactType: "NO", name: "START" });
          const k1hold = b.place("elec.relay-contact", 350, 280, { contactType: "NO", deviceLabel: "K1" });
          const k1coil = b.place("elec.relay-coil", 250, 400, { label: "K1" });
          const k1lamp = b.place("elec.relay-contact", 480, 280, { contactType: "NO", deviceLabel: "K1" });
          const lampL = b.place("elec.lamp", 480, 400, { name: "L1" });
          const sup0 = b.place("elec.supply-0v", 360, 500);

          b.connect(sup24, "P", stop, "T");
          b.connect(stop, "B", start, "T");
          b.connect(stop, "B", k1hold, "T");
          b.connect(start, "B", k1coil, "T");
          b.connect(k1hold, "B", k1coil, "T");
          b.connect(k1coil, "B", sup0, "P");
          b.connect(sup24, "P", k1lamp, "T");
          b.connect(k1lamp, "B", lampL, "T");
          b.connect(lampL, "B", sup0, "P");
        },
      ),
  },
  {
    id: "electro-reciprocate",
    category: "전기공압",
    name: "9. 전기공압 — 연속 왕복 (리밋 + 솔레노이드)",
    build: () =>
      buildCircuit(
        "전기공압 연속 왕복",
        "셀렉터 스위치를 켜면 리밋 스위치 신호로 양측 솔레노이드 밸브가 전환되어 실린더가 연속 왕복한다.",
        (b) => {
          // 공압부
          const cyl = b.place("pneu.cylinder.double", 480, 100, { label: "A" });
          const valve = b.place("pneu.valve.5-2-double-solenoid", 480, 220, {
            solenoidLeft: "Y1",
            solenoidRight: "Y2",
          });
          const src = b.place("pneu.source", 510, 330);
          b.connect(src, "P", valve, "P");
          b.connect(valve, "A", cyl, "HEAD");
          b.connect(valve, "B", cyl, "ROD");

          // 전기부 (사다리)
          const sup24 = b.place("elec.supply-24v", 150, 420);
          const run = b.place("elec.pushbutton", 150, 500, {
            contactType: "NO",
            actuation: "maintained",
            name: "RUN",
          });
          const s1 = b.place("elec.limit-switch", 150, 590, {
            contactType: "NO",
            cylinderLabel: "A",
            triggerAt: "retracted",
            name: "S1",
          });
          const y1 = b.place("elec.solenoid", 150, 680, { label: "Y1" });
          const s2 = b.place("elec.limit-switch", 320, 500, {
            contactType: "NO",
            cylinderLabel: "A",
            triggerAt: "extended",
            name: "S2",
          });
          const y2 = b.place("elec.solenoid", 320, 680, { label: "Y2" });
          const sup0 = b.place("elec.supply-0v", 240, 760);

          b.connect(sup24, "P", run, "T");
          b.connect(run, "B", s1, "T");
          b.connect(s1, "B", y1, "T");
          b.connect(y1, "B", sup0, "P");
          b.connect(sup24, "P", s2, "T");
          b.connect(s2, "B", y2, "T");
          b.connect(y2, "B", sup0, "P");
        },
      ),
  },
  {
    id: "timer-return",
    category: "전기공압",
    name: "10. 타이머 — 전진 후 3초 뒤 자동 복귀",
    build: () =>
      buildCircuit(
        "타이머 자동 복귀",
        "START를 누르면 전진, 전진단 도달 후 온딜레이 타이머 T1이 3초를 세고 자동 복귀시킨다.",
        (b) => {
          const cyl = b.place("pneu.cylinder.double", 480, 100, { label: "A" });
          const valve = b.place("pneu.valve.5-2-double-solenoid", 480, 220, {
            solenoidLeft: "Y1",
            solenoidRight: "Y2",
          });
          const src = b.place("pneu.source", 510, 330);
          b.connect(src, "P", valve, "P");
          b.connect(valve, "A", cyl, "HEAD");
          b.connect(valve, "B", cyl, "ROD");

          const sup24 = b.place("elec.supply-24v", 150, 420);
          const start = b.place("elec.pushbutton", 150, 500, { contactType: "NO", name: "START" });
          const y1 = b.place("elec.solenoid", 150, 680, { label: "Y1" });
          const s2 = b.place("elec.limit-switch", 320, 500, {
            contactType: "NO",
            cylinderLabel: "A",
            triggerAt: "extended",
            name: "S2",
          });
          const t1 = b.place("elec.timer", 320, 680, { label: "T1", mode: "on-delay", preset: 3 });
          const t1ct = b.place("elec.relay-contact", 490, 500, { contactType: "NO", deviceLabel: "T1" });
          const y2 = b.place("elec.solenoid", 490, 680, { label: "Y2" });
          const sup0 = b.place("elec.supply-0v", 320, 760);

          b.connect(sup24, "P", start, "T");
          b.connect(start, "B", y1, "T");
          b.connect(y1, "B", sup0, "P");
          b.connect(sup24, "P", s2, "T");
          b.connect(s2, "B", t1, "T");
          b.connect(t1, "B", sup0, "P");
          b.connect(sup24, "P", t1ct, "T");
          b.connect(t1ct, "B", y2, "T");
          b.connect(y2, "B", sup0, "P");
        },
      ),
  },
  {
    id: "a-b-sequence",
    category: "자격증 유형",
    name: "11. A+B+A−B− 시퀀스 (공유압기능사 유형)",
    build: () =>
      buildCircuit(
        "A+B+A−B− 시퀀스",
        "START를 누르면 2그룹 캐스케이드(릴레이 K1)로 A전진→B전진→A후진→B후진이 한 사이클 실행된다.",
        (b) => {
          // ---- 공압부 (상단) ----
          const cylA = b.place("pneu.cylinder.double", 220, 70, { label: "A" });
          const cylB = b.place("pneu.cylinder.double", 620, 70, { label: "B" });
          const valveA = b.place("pneu.valve.5-2-double-solenoid", 220, 190, {
            solenoidLeft: "Y1",
            solenoidRight: "Y2",
          });
          const valveB = b.place("pneu.valve.5-2-double-solenoid", 620, 190, {
            solenoidLeft: "Y3",
            solenoidRight: "Y4",
          });
          const tee = b.place("pneu.tee", 430, 300);
          const src = b.place("pneu.source", 430, 370);
          b.connect(valveA, "A", cylA, "HEAD");
          b.connect(valveA, "B", cylA, "ROD");
          b.connect(valveB, "A", cylB, "HEAD");
          b.connect(valveB, "B", cylB, "ROD");
          b.connect(src, "P", tee, "3");
          b.connect(tee, "1", valveA, "P");
          b.connect(tee, "2", valveB, "P");

          // ---- 전기부 (하단 사다리) ----
          // R1: START·S1·S3 → K1  |  R2(유지): K1·S4(NC) → K1
          // R3: K1·S1 → Y1(A+)    |  R4: K1·S2 → Y3(B+)
          // R5: K1(NC)·S4 → Y2(A−)|  R6: K1(NC)·S1 → Y4(B−)
          const sup24 = b.place("elec.supply-24v", 430, 440);
          const sup0 = b.place("elec.supply-0v", 430, 850);

          const start = b.place("elec.pushbutton", 130, 520, { contactType: "NO", name: "START" });
          const r1s1 = b.place("elec.limit-switch", 130, 600, { contactType: "NO", cylinderLabel: "A", triggerAt: "retracted", name: "S1" });
          const r1s3 = b.place("elec.limit-switch", 130, 680, { contactType: "NO", cylinderLabel: "B", triggerAt: "retracted", name: "S3" });
          const k1coil = b.place("elec.relay-coil", 130, 770, { label: "K1" });

          const r2k1 = b.place("elec.relay-contact", 250, 520, { contactType: "NO", deviceLabel: "K1" });
          const r2s4 = b.place("elec.limit-switch", 250, 600, { contactType: "NC", cylinderLabel: "B", triggerAt: "extended", name: "S4" });

          const r3k1 = b.place("elec.relay-contact", 370, 520, { contactType: "NO", deviceLabel: "K1" });
          const r3s1 = b.place("elec.limit-switch", 370, 600, { contactType: "NO", cylinderLabel: "A", triggerAt: "retracted", name: "S1" });
          const y1 = b.place("elec.solenoid", 370, 770, { label: "Y1" });

          const r4k1 = b.place("elec.relay-contact", 490, 520, { contactType: "NO", deviceLabel: "K1" });
          const r4s2 = b.place("elec.limit-switch", 490, 600, { contactType: "NO", cylinderLabel: "A", triggerAt: "extended", name: "S2" });
          const y3 = b.place("elec.solenoid", 490, 770, { label: "Y3" });

          const r5k1 = b.place("elec.relay-contact", 610, 520, { contactType: "NC", deviceLabel: "K1" });
          const r5s4 = b.place("elec.limit-switch", 610, 600, { contactType: "NO", cylinderLabel: "B", triggerAt: "extended", name: "S4" });
          const y2 = b.place("elec.solenoid", 610, 770, { label: "Y2" });

          const r6k1 = b.place("elec.relay-contact", 730, 520, { contactType: "NC", deviceLabel: "K1" });
          const r6s1 = b.place("elec.limit-switch", 730, 600, { contactType: "NO", cylinderLabel: "A", triggerAt: "retracted", name: "S1" });
          const y4 = b.place("elec.solenoid", 730, 770, { label: "Y4" });

          // R1
          b.connect(sup24, "P", start, "T");
          b.connect(start, "B", r1s1, "T");
          b.connect(r1s1, "B", r1s3, "T");
          b.connect(r1s3, "B", k1coil, "T");
          b.connect(k1coil, "B", sup0, "P");
          // R2 (자기유지)
          b.connect(sup24, "P", r2k1, "T");
          b.connect(r2k1, "B", r2s4, "T");
          b.connect(r2s4, "B", k1coil, "T");
          // R3
          b.connect(sup24, "P", r3k1, "T");
          b.connect(r3k1, "B", r3s1, "T");
          b.connect(r3s1, "B", y1, "T");
          b.connect(y1, "B", sup0, "P");
          // R4
          b.connect(sup24, "P", r4k1, "T");
          b.connect(r4k1, "B", r4s2, "T");
          b.connect(r4s2, "B", y3, "T");
          b.connect(y3, "B", sup0, "P");
          // R5
          b.connect(sup24, "P", r5k1, "T");
          b.connect(r5k1, "B", r5s4, "T");
          b.connect(r5s4, "B", y2, "T");
          b.connect(y2, "B", sup0, "P");
          // R6
          b.connect(sup24, "P", r6k1, "T");
          b.connect(r6k1, "B", r6s1, "T");
          b.connect(r6s1, "B", y4, "T");
          b.connect(y4, "B", sup0, "P");
        },
      ),
  },
  {
    id: "hyd-basic",
    category: "유압",
    name: "12. 유압 기초 — 4/2 밸브 실린더 왕복",
    build: () =>
      buildCircuit(
        "유압 기초 회로",
        "파워유닛 → 4/2 레버 밸브 → 복동 유압 실린더. 압력계로 P라인 가압을 확인한다.",
        (b) => {
          const cyl = b.place("hyd.cylinder.double", 420, 100);
          const valve = b.place("hyd.valve.4-2-lever", 420, 230);
          const tee = b.place("hyd.tee", 440, 340);
          const gauge = b.place("hyd.gauge", 300, 300);
          const pu = b.place("hyd.power-unit", 450, 430);
          const tk = b.place("hyd.tank", 550, 340);

          b.connect(valve, "A", cyl, "HEAD");
          b.connect(valve, "B", cyl, "ROD");
          b.connect(pu, "P", tee, "3");
          b.connect(tee, "2", valve, "P");
          b.connect(tee, "1", gauge, "P");
          b.connect(valve, "T", tk, "T");
        },
      ),
  },
  {
    id: "hyd-43-electric",
    category: "유압",
    name: "13. 유압 4/3 (클로즈드 센터) 전기 조그 제어",
    build: () =>
      buildCircuit(
        "유압 4/3 전기 제어",
        "UP/DOWN 버튼을 누르는 동안 전진/후진하고, 놓으면 클로즈드 센터가 실린더를 그 자리에 유지한다.",
        (b) => {
          const cyl = b.place("hyd.cylinder.double", 460, 100);
          const valve = b.place("hyd.valve.4-3-closed-solenoid", 460, 230, {
            solenoidLeft: "Y1",
            solenoidRight: "Y2",
          });
          const pu = b.place("hyd.power-unit", 460, 360);
          const tk = b.place("hyd.tank", 580, 300);
          b.connect(valve, "A", cyl, "HEAD");
          b.connect(valve, "B", cyl, "ROD");
          b.connect(pu, "P", valve, "P");
          b.connect(valve, "T", tk, "T");

          const sup24 = b.place("elec.supply-24v", 150, 460);
          const up = b.place("elec.pushbutton", 100, 550, { contactType: "NO", name: "UP" });
          const y1 = b.place("elec.solenoid", 100, 660, { label: "Y1" });
          const down = b.place("elec.pushbutton", 230, 550, { contactType: "NO", name: "DOWN" });
          const y2 = b.place("elec.solenoid", 230, 660, { label: "Y2" });
          const sup0 = b.place("elec.supply-0v", 160, 740);

          b.connect(sup24, "P", up, "T");
          b.connect(up, "B", y1, "T");
          b.connect(y1, "B", sup0, "P");
          b.connect(sup24, "P", down, "T");
          b.connect(down, "B", y2, "T");
          b.connect(y2, "B", sup0, "P");
        },
      ),
  },
  {
    id: "hyd-meter-out",
    category: "유압",
    name: "14. 유압 미터아웃 속도 제어",
    build: () =>
      buildCircuit(
        "유압 미터아웃",
        "로드측 배출 유량을 유량조절밸브로 교축해 전진 속도를 제어한다 (부하 유지에 유리한 방식).",
        (b) => {
          const cyl = b.place("hyd.cylinder.double", 420, 100);
          // rotation 270: A 아래, B 위 — 실린더에서 나가는 기름(B→A)이 교축
          const fc = b.place("hyd.flow-control", 470, 190, { openness: 0.3 }, 270);
          const valve = b.place("hyd.valve.4-2-lever", 420, 300);
          const pu = b.place("hyd.power-unit", 450, 430);
          const tk = b.place("hyd.tank", 570, 360);

          b.connect(valve, "A", cyl, "HEAD");
          b.connect(fc, "B", cyl, "ROD");
          b.connect(fc, "A", valve, "B");
          b.connect(pu, "P", valve, "P");
          b.connect(valve, "T", tk, "T");
        },
      ),
  },
  {
    id: "plc-self-holding",
    category: "PLC",
    name: "15. PLC — 자기유지 (XG5000 스타일)",
    build: () =>
      buildCircuit(
        "PLC 자기유지",
        "P0(START)로 M0 자기유지, P1(STOP, b접점)로 해제. M0가 출력 P20(램프)을 구동한다. 하단 PLC 패널에서 래더 확인.",
        (b) => {
          const start = b.place("elec.pushbutton", 200, 150, { contactType: "NO", name: "START (P0)" });
          const stop = b.place("elec.pushbutton", 330, 150, { contactType: "NO", name: "STOP (P1)" });
          const lampL = b.place("elec.lamp", 470, 150, { name: "L1 (P20)" });
          b.setPlc(
            {
              rungs: [
                rungOf(
                  [
                    [lc("no", "P0"), lc("nc", "P1"), lc("coil", "M0")],
                    [lc("no", "M0"), null],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf([[lc("no", "M0"), lc("coil", "P20")]]),
              ],
            },
            [
              { device: "P0", direction: "input", componentId: start },
              { device: "P1", direction: "input", componentId: stop },
              { device: "P20", direction: "output", componentId: lampL },
            ],
          );
        },
      ),
  },
  {
    id: "plc-reciprocate",
    category: "PLC",
    name: "16. PLC — 전기공압 왕복 재현",
    build: () =>
      buildCircuit(
        "PLC 전기공압 왕복",
        "예제 9의 릴레이 회로를 PLC 래더로 치환. P0(RUN)·P1(S1)·P2(S2) 입력, P20(Y1)·P21(Y2) 출력.",
        (b) => {
          const cyl = b.place("pneu.cylinder.double", 480, 100, { label: "A" });
          const valve = b.place("pneu.valve.5-2-double-solenoid", 480, 220, {
            solenoidLeft: "Y1",
            solenoidRight: "Y2",
          });
          const src = b.place("pneu.source", 510, 330);
          b.connect(src, "P", valve, "P");
          b.connect(valve, "A", cyl, "HEAD");
          b.connect(valve, "B", cyl, "ROD");

          const runSw = b.place("elec.pushbutton", 130, 450, {
            contactType: "NO",
            actuation: "maintained",
            name: "RUN (P0)",
          });
          const s1 = b.place("elec.limit-switch", 130, 540, {
            contactType: "NO", cylinderLabel: "A", triggerAt: "retracted", name: "S1 (P1)",
          });
          const s2 = b.place("elec.limit-switch", 130, 630, {
            contactType: "NO", cylinderLabel: "A", triggerAt: "extended", name: "S2 (P2)",
          });
          const y1 = b.place("elec.solenoid", 300, 490, { label: "Y1" });
          const y2 = b.place("elec.solenoid", 300, 590, { label: "Y2" });

          b.setPlc(
            {
              rungs: [
                rungOf([[lc("no", "P0"), lc("no", "P1"), lc("coil", "P20")]]),
                rungOf([[lc("no", "P2"), lc("coil", "P21")]]),
              ],
            },
            [
              { device: "P0", direction: "input", componentId: runSw },
              { device: "P1", direction: "input", componentId: s1 },
              { device: "P2", direction: "input", componentId: s2 },
              { device: "P20", direction: "output", componentId: y1 },
              { device: "P21", direction: "output", componentId: y2 },
            ],
          );
        },
      ),
  },
  {
    id: "plc-timer",
    category: "PLC",
    name: "17. PLC — 타이머 점등 (TON)",
    build: () =>
      buildCircuit(
        "PLC 타이머",
        "P0 셀렉터를 켜면 TON T0가 3초를 센 뒤 P20(램프)을 켠다.",
        (b) => {
          const sw = b.place("elec.pushbutton", 200, 150, {
            contactType: "NO",
            actuation: "maintained",
            name: "SW (P0)",
          });
          const lampL = b.place("elec.lamp", 360, 150, { name: "L1 (P20)" });
          b.setPlc(
            {
              rungs: [
                rungOf([[lc("no", "P0"), lc("ton", "T0", 3)]]),
                rungOf([[lc("no", "T0"), lc("coil", "P20")]]),
              ],
            },
            [
              { device: "P0", direction: "input", componentId: sw },
              { device: "P20", direction: "output", componentId: lampL },
            ],
          );
        },
      ),
  },
  {
    id: "hyd-reducing",
    category: "유압",
    name: "18. 감압밸브 + 압력 스위치",
    build: () =>
      buildCircuit(
        "감압 회로",
        "파워유닛 40bar를 감압밸브가 20bar로 낮춘다. 압력계 두 개로 전·후 압력을 비교하고, 압력 스위치(15bar)가 램프를 켠다.",
        (b) => {
          const pu = b.place("hyd.power-unit", 150, 430, { pressure: 40 });
          const tee1 = b.place("hyd.tee", 140, 330);
          const g1 = b.place("hyd.gauge", 80, 250);
          const red = b.place("hyd.reducing", 290, 330, { pressure: 20 });
          const tee2 = b.place("hyd.tee", 420, 330);
          const g2 = b.place("hyd.gauge", 400, 230);
          const ps = b.place("hyd.pressure-switch", 530, 250, { threshold: 15, name: "PS1" });

          b.connect(pu, "P", tee1, "3");
          b.connect(tee1, "1", g1, "P");
          b.connect(tee1, "2", red, "P");
          b.connect(red, "A", tee2, "1");
          b.connect(tee2, "3", g2, "P");
          b.connect(tee2, "2", ps, "P");

          const sup24 = b.place("elec.supply-24v", 650, 150);
          const lampL = b.place("elec.lamp", 650, 330, { name: "L1" });
          const sup0 = b.place("elec.supply-0v", 650, 430);
          b.connect(sup24, "P", ps, "T");
          b.connect(ps, "B", lampL, "T");
          b.connect(lampL, "B", sup0, "P");
        },
      ),
  },
];

export function getExample(id: string): ExampleEntry | undefined {
  return examples.find((e) => e.id === id);
}
