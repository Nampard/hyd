import type { CircuitDocument } from "../model/types";
import { buildCircuit, lc, rungOf } from "./builder";

/**
 * 예제 19: 자동화설비 스테이션 자동운전 (수업자료 슬라이드 9 LD 재구성 — Phase 14).
 * 대형 examples/index.ts에서 분리 (codex-review-phase-14 P2-8).
 * 소유자 본인 작성 래더를 교육용 데이터 모델로 재구성한 것 (ASSET_PROVENANCE 참조).
 */
export function buildAutomationStationExample(): CircuitDocument {
  return (
      buildCircuit(
        "자동화설비 스테이션 자동운전",
        "수업자료 슬라이드 9의 래더를 그대로 재현: PB2 기동 → A공급 → B드릴 가공 → C이송 → 컨베이어 초입에서 용량형/유도형 판별 → 분류(기본: 금속=D배출박스/비금속=저장박스, PB3 누르면 반전). 사이클 후 매거진에 물품이 있으면 자동 재시작(M22), 없으면 종료(M23). 금1·비1 처리 시 카운터 종료(M25). PB4 누르면 일시정지(적램 점멸)·떼면 초기화(음변환). 녹램=운전 점멸, 황램=판별 점멸. (실기 T0019=3.5s는 시뮬레이터 컨베이어 속도·센서 위치에 맞춰 2.2s)",
        (b) => {
          const st = b.place("auto.automation-station", 450, 260, { workpieces: "금,비" });
          // 장비 뷰 전용 위치: 스테이션(폭 280·높이 170)이 좁은 장비 캔버스에서
          // 잘리지 않도록 좌상단 가까이 고정 (codex-review P1-2)
          b.setEquipment(st, 170, 120);
          b.setPlc(
            {
              rungs: [
                // ===== 입력부 (슬라이드 9 좌상) =====
                // M10 = (매거진 & PB2 ∥ M10) & !M26 — 기동 자기유지, 초기화 통합으로 해제
                rungOf(
                  [
                    [lc("no", "P0000C"), lc("no", "P00001"), lc("nc", "M00026"), lc("coil", "M00010")],
                    [lc("no", "M00010"), lc("hline")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 2 }],
                ),
                // M11 = M10 & !M22 — 재시작(M22) 펄스가 스텝 체인을 리셋
                rungOf([[lc("no", "M00010"), lc("nc", "M00022"), lc("coil", "M00011")]]),
                // 스텝 체인: 유지 접점은 첫 접점(센서)에만 병렬 (원본 구조)
                rungOf(
                  [
                    [lc("no", "P00005"), lc("no", "M00011"), lc("coil", "M00012")],
                    [lc("no", "M00012")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "P00004"), lc("no", "M00012"), lc("coil", "M00013")],
                    [lc("no", "M00013")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "P00007"), lc("no", "M00013"), lc("coil", "M00014")],
                    [lc("no", "M00014")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "P00006"), lc("no", "M00014"), lc("coil", "M00015")],
                    [lc("no", "M00015")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "P00009"), lc("no", "M00015"), lc("coil", "M00016")],
                    [lc("no", "M00016")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "P00008"), lc("no", "M00016"), lc("coil", "M00017")],
                    [lc("no", "M00017")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                // 컨베이어 구간 (비금속 사이클 종료 신호)
                rungOf([[lc("no", "M00017"), lc("ton", "T0018", 8)]]),

                // ===== 금속(M100)/비금속(M101) 판별 (슬라이드 9 우상) =====
                rungOf(
                  [
                    [lc("no", "P0000E"), lc("no", "P0000F"), lc("no", "M00011"), lc("coil", "M00100")],
                    [lc("no", "M00100"), lc("hline")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 2 }],
                ),
                rungOf(
                  [
                    [lc("no", "P0000E"), lc("nc", "P0000F"), lc("no", "M00011"), lc("nc", "M00100"), lc("coil", "M00101")],
                    [lc("no", "M00101"), lc("hline")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 2 }],
                ),
                // D 지연: 평소 금속(M100&!M24), PB3 라인변경 시 비금속(M101&M24)
                rungOf(
                  [
                    [lc("no", "M00100"), lc("nc", "M00024"), lc("ton", "T0019", 2.2)],
                    [lc("no", "M00101"), lc("no", "M00024")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 2 }],
                ),
                rungOf(
                  [
                    [lc("no", "P0000B"), lc("no", "T0019"), lc("coil", "M00020")],
                    [lc("no", "M00020")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "P0000A"), lc("no", "M00020"), lc("coil", "M00021")],
                    [lc("no", "M00021")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),

                // ===== 사이클 종료: 재시작(M22)/끝(M23) — 금끝=M21, 비금끝=T18 =====
                rungOf(
                  [
                    [lc("no", "M00021"), lc("no", "P0000C"), lc("coil", "M00022")],
                    [lc("no", "T0018")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),
                rungOf(
                  [
                    [lc("no", "M00021"), lc("nc", "P0000C"), lc("coil", "M00023")],
                    [lc("no", "T0018")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),

                // ===== PB3 라인변경 (M24): 판별 반전 =====
                rungOf(
                  [
                    [lc("no", "P00002"), lc("no", "M00011"), lc("coil", "M00024")],
                    [lc("no", "M00024")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ),

                // ===== 금1·비1 카운터 종료 =====
                rungOf(
                  [
                    [lc("no", "M00100"), lc("no", "M00021"), lc("ctu", "C0001", 1)],
                    [null, lc("no", "T0018")],
                  ],
                  [{ r: 0, c: 1 }, { r: 0, c: 2 }],
                ),
                rungOf(
                  [
                    [lc("no", "M00101"), lc("no", "M00021"), lc("ctu", "C0002", 1)],
                    [null, lc("no", "T0018")],
                  ],
                  [{ r: 0, c: 1 }, { r: 0, c: 2 }],
                ),
                rungOf([[lc("no", "C0001"), lc("no", "C0002"), lc("coil", "M00025")]]),

                // ===== 초기화 통합 (M26): 끝(M23) ∥ PB4 음변환 ∥ 카운터 종료(M25) =====
                rungOf(
                  [
                    [lc("no", "M00023"), lc("coil", "M00026")],
                    [lc("ne", "P00003")],
                    [lc("no", "M00025")],
                  ],
                  [
                    { r: 0, c: 0 }, { r: 0, c: 1 },
                    { r: 1, c: 0 }, { r: 1, c: 1 },
                  ],
                ),
                rungOf(
                  [
                    [lc("no", "M00026"), lc("rst", "C0001")],
                    [null, lc("rst", "C0002")],
                  ],
                  [{ r: 0, c: 1 }],
                ),

                // ===== 출력부 (슬라이드 9 좌하) — PB4 누름 = 일시정지 =====
                rungOf([[lc("no", "M00011"), lc("nc", "M00012"), lc("nc", "P00003"), lc("coil", "P00010")]]), // A전솔
                rungOf(
                  [
                    [lc("no", "M00012"), lc("coil", "P00011")],
                    [lc("no", "P00003")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ), // A후솔 = M12 ∥ PB4 (일시정지 중 안전 복귀)
                rungOf([[lc("no", "M00013"), lc("nc", "M00014"), lc("nc", "P00003"), lc("coil", "P00012")]]), // B전솔
                rungOf([[lc("no", "M00015"), lc("nc", "M00016"), lc("nc", "P00003"), lc("coil", "P00013")]]), // C전솔
                rungOf([[lc("no", "T0019"), lc("nc", "M00020"), lc("nc", "P00003"), lc("coil", "P00014")]]), // D전솔
                rungOf([[lc("no", "M00012"), lc("nc", "M00015"), lc("nc", "P00003"), lc("coil", "P00015")]]), // 드릴모터
                rungOf([[lc("no", "M00017"), lc("nc", "T0018"), lc("nc", "P00003"), lc("coil", "P00016")]]), // 컨베이어
                rungOf([[lc("no", "M00011"), lc("nc", "_T1S"), lc("nc", "P00003"), lc("coil", "P00019")]]), // 녹램: 운전 중 1초 점멸
                rungOf(
                  [
                    [lc("no", "M00101"), lc("nc", "_T1S"), lc("nc", "P00003"), lc("coil", "P00018")],
                    [lc("no", "M00100")],
                  ],
                  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
                ), // 황램: 판별 완료 점멸
                rungOf([[lc("no", "P00003"), lc("nc", "_T2S"), lc("coil", "P00017")]]), // 적램: 일시정지 2초 점멸
              ],
            },
            [
              // 수업자료 I/O 맵 20점 전체
              { device: "P00000", direction: "input", componentId: st, channel: "PB1" },
              { device: "P00001", direction: "input", componentId: st, channel: "PB2" },
              { device: "P00002", direction: "input", componentId: st, channel: "PB3" },
              { device: "P00003", direction: "input", componentId: st, channel: "PB4" },
              { device: "P00004", direction: "input", componentId: st, channel: "A후센" },
              { device: "P00005", direction: "input", componentId: st, channel: "A전센" },
              { device: "P00006", direction: "input", componentId: st, channel: "B후센" },
              { device: "P00007", direction: "input", componentId: st, channel: "B전센" },
              { device: "P00008", direction: "input", componentId: st, channel: "C후센" },
              { device: "P00009", direction: "input", componentId: st, channel: "C전센" },
              { device: "P0000A", direction: "input", componentId: st, channel: "D후센" },
              { device: "P0000B", direction: "input", componentId: st, channel: "D전센" },
              { device: "P0000C", direction: "input", componentId: st, channel: "매거진" },
              { device: "P0000D", direction: "input", componentId: st, channel: "포토" },
              { device: "P0000E", direction: "input", componentId: st, channel: "용량형" },
              { device: "P0000F", direction: "input", componentId: st, channel: "유도형" },
              { device: "P00010", direction: "output", componentId: st, channel: "A전솔" },
              { device: "P00011", direction: "output", componentId: st, channel: "A후솔" },
              { device: "P00012", direction: "output", componentId: st, channel: "B전솔" },
              { device: "P00013", direction: "output", componentId: st, channel: "C전솔" },
              { device: "P00014", direction: "output", componentId: st, channel: "D전솔" },
              { device: "P00015", direction: "output", componentId: st, channel: "드릴모터" },
              { device: "P00016", direction: "output", componentId: st, channel: "컨베이어" },
              { device: "P00017", direction: "output", componentId: st, channel: "적램" },
              { device: "P00018", direction: "output", componentId: st, channel: "황램" },
              { device: "P00019", direction: "output", componentId: st, channel: "녹램" },
            ],
          );
        },
      )
  );
}
