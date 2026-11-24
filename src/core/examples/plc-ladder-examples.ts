import type { CircuitDocument } from "../model/types";
import { createEmptyDocument } from "../model/types";
import { createEmptyProgram, type LadderProgram } from "../plc/model";
import { lc, rungOf } from "./builder";
import { summarizeLearningActivity } from "../model/learning-activity";

/**
 * PLC 래더 모드 문서와 예제 (Phase 38).
 *
 * 부품 없이 래더만 있는 문서다. 입력은 화면의 입력 스위치(P00000~P00007 누름버튼,
 * P00008~P0000F 토글 스위치), 출력은 출력 램프(P00010~P0001F)로 확인한다 — 실습실의
 * PLC 트레이너 보드와 같은 배치. ioMap은 비워 둔다(엔진이 화면 스위치 입력을 직접 받는다).
 */

function ladderDoc(title: string, description: string, program: LadderProgram): CircuitDocument {
  const base = createEmptyDocument(title);
  const doc: CircuitDocument = { ...base, meta: { ...base.meta, description }, plcProgram: program, ioMap: [] };
  const activity = summarizeLearningActivity(doc);
  return activity ? { ...doc, meta: { ...doc.meta, learningActivity: activity } } : doc;
}

/** PLC 래더 모드의 "새 래더" — 빈 렁 하나 */
export function buildBlankLadderDocument(): CircuitDocument {
  return ladderDoc("새 PLC 래더", "", createEmptyProgram());
}

/** 1. 자기유지: P00000(시작) 누르면 P00010 켜지고 유지, P00001(정지) 누르면 꺼짐 */
export function buildSelfHoldLadder(): CircuitDocument {
  return ladderDoc(
    "자기유지 회로 (시작·정지)",
    "P00000(시작)을 누르면 P00010이 켜지고 손을 떼도 유지된다. P00001(정지)을 누르면 꺼진다. 정지 b접점이 직렬이라 두 버튼을 함께 누르면 정지가 우선한다.",
    {
      rungs: [
        rungOf(
          [
            [lc("no", "P00000"), lc("nc", "P00001"), lc("coil", "P00010")],
            [lc("no", "P00010")],
          ],
          [{ r: 0, c: 0 }, { r: 0, c: 1 }],
        ),
      ],
    },
  );
}

/** 2. 온딜레이 타이머: 스위치 P00008을 켜면 P00010은 바로, P00011은 3초 뒤에 켜짐 */
export function buildOnDelayLadder(): CircuitDocument {
  return ladderDoc(
    "타이머 지연 동작 (TON 3초)",
    "토글 스위치 P00008을 켜면 P00010은 바로 켜지고, T0000이 3초를 센 뒤 P00011이 켜진다. 스위치를 끄면 타이머가 0으로 돌아가고 둘 다 꺼진다.",
    {
      rungs: [
        rungOf([[lc("no", "P00008"), lc("coil", "P00010")]]),
        rungOf([[lc("no", "P00008"), lc("ton", "T0000", 3)]]),
        rungOf([[lc("no", "T0000"), lc("coil", "P00011")]]),
      ],
    },
  );
}

/** 3. 플리커: 스위치 P00008이 켜져 있는 동안 P00010이 1초 간격으로 점멸 */
export function buildFlickerLadder(): CircuitDocument {
  return ladderDoc(
    "플리커 회로 (1초 점멸)",
    "토글 스위치 P00008이 켜져 있는 동안 타이머 두 개가 서로를 리셋하며 P00010을 1초 꺼짐·1초 켜짐으로 반복한다. T0000이 꺼짐 시간, T0001이 켜짐 시간이다.",
    {
      rungs: [
        rungOf([[lc("no", "P00008"), lc("nc", "T0001"), lc("ton", "T0000", 1)]]),
        rungOf([[lc("no", "T0000"), lc("ton", "T0001", 1)]]),
        rungOf([[lc("no", "T0000"), lc("coil", "P00010")]]),
      ],
    },
  );
}

/** 4. 카운터: P00000을 3번 누르면 P00010 켜짐, P00001로 카운터 리셋 */
export function buildCounterLadder(): CircuitDocument {
  return ladderDoc(
    "카운터 (CTU 3회)와 리셋",
    "P00000을 누를 때마다 C0000이 1씩 센다(누르는 순간만 셈). 3이 되면 P00010이 켜진다. P00001을 누르면 카운터가 0으로 돌아가고 램프가 꺼진다.",
    {
      rungs: [
        rungOf([[lc("no", "P00000"), lc("ctu", "C0000", 3)]]),
        rungOf([[lc("no", "C0000"), lc("coil", "P00010")]]),
        rungOf([[lc("no", "P00001"), lc("rst", "C0000")]]),
      ],
    },
  );
}

/** 5. 정역 인터록: 정회전(P00010)·역회전(P00011)이 동시에 켜지지 않음 */
export function buildInterlockLadder(): CircuitDocument {
  return ladderDoc(
    "정역 운전 인터록",
    "P00000(정회전)·P00001(역회전)으로 각각 자기유지하고 P00002(정지)로 끈다. 서로의 출력 b접점을 직렬로 넣어 한쪽이 켜져 있으면 다른 쪽은 켜지지 않는다 — 모터 정역 회로의 인터록.",
    {
      rungs: [
        rungOf(
          [
            [lc("no", "P00000"), lc("nc", "P00002"), lc("nc", "P00011"), lc("coil", "P00010")],
            [lc("no", "P00010")],
          ],
          [{ r: 0, c: 0 }, { r: 0, c: 1 }],
        ),
        rungOf(
          [
            [lc("no", "P00001"), lc("nc", "P00002"), lc("nc", "P00010"), lc("coil", "P00011")],
            [lc("no", "P00011")],
          ],
          [{ r: 0, c: 0 }, { r: 0, c: 1 }],
        ),
      ],
    },
  );
}
