import type { IoChannelDef } from "../types";

/**
 * 자동화설비 스테이션의 I/O 채널 목록 (수업자료 I/O 맵 그대로).
 * 라이브러리·시뮬레이션이 공유하는 단일 출처 — 다른 모듈을 import하지 않는 리프.
 * (sim/mps-station의 상태기계와 이름이 일치해야 하며, 일치성은 테스트로 보증한다)
 */

/** 입력 16점 — PB1~4, A~D 전·후센, 매거진·포토·용량형·유도형 */
export const MPS_INPUT_CHANNELS = [
  "PB1",
  "PB2",
  "PB3",
  "PB4",
  "A후센",
  "A전센",
  "B후센",
  "B전센",
  "C후센",
  "C전센",
  "D후센",
  "D전센",
  "매거진",
  "포토",
  "용량형",
  "유도형",
] as const;

/** 출력 10점 — A전·후솔, B~D전솔, 드릴·컨베이어 모터, 램프 3 */
export const MPS_OUTPUT_CHANNELS = [
  "A전솔",
  "A후솔",
  "B전솔",
  "C전솔",
  "D전솔",
  "드릴모터",
  "컨베이어",
  "적램",
  "황램",
  "녹램",
] as const;

export type MpsInputChannel = (typeof MPS_INPUT_CHANNELS)[number];
export type MpsOutputChannel = (typeof MPS_OUTPUT_CHANNELS)[number];

/** ComponentDefinition.ioChannels용 목록 (입력 16 + 출력 10 = 26점) */
export const MPS_IO_CHANNELS: IoChannelDef[] = [
  ...MPS_INPUT_CHANNELS.map((id): IoChannelDef => ({ id, direction: "input" })),
  ...MPS_OUTPUT_CHANNELS.map((id): IoChannelDef => ({ id, direction: "output" })),
];
