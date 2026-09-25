# HYD — 공압·유압·전기·PLC 교육용 웹 시뮬레이터

특성화고 수업과 공유압기능사·자동화설비기능사 대비용 회로 작도 + 시뮬레이션 웹앱.
사용자는 이 앱으로 수업하는 교사다. 결과물은 학생이 보는 화면이므로, 기호·색·동작이
실기 도면과 다르면 그 자체가 버그다.

## 현재 상태

- Phase 0~22 완료. 진행 기록과 다음 후보는 [docs/ROADMAP.md](docs/ROADMAP.md)의 마지막
  Phase와 "후순위 후보"에 있다. 새 작업은 ROADMAP에 Phase를 추가하며 진행한다.
- 문서 스키마 v5 (v4: ioMap channel, v5: `auto.automation-station` 리네임).
- 작업 전 [docs/PRD.md](docs/PRD.md)(범위·non-goals)와
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)(모듈·데이터 모델·솔버)를 필요한 만큼 읽는다.

## 고정된 결정 — 바꾸려면 먼저 사용자에게 묻는다

- 웹 프론트엔드 단독 (React 18 + TS + Vite + SVG + zustand). 백엔드 없음, 로컬 JSON 저장.
- 시뮬레이션은 논리/상태 기반. 전류·유량 수치 해석은 도입하지 않는다
  (압력 레벨은 bar 단위 준정량까지만).
- PLC는 교육용 래더(LD). XG5000(LS산전) 표기 관례를 참고하되 비공식·비제휴임을 밝힌다.
- UI 언어는 한국어. 기호는 KS B 0054 / ISO 1219(유공압), KS C IEC 60617(전기) 관례를 따른다.

## 코드 규약

- `src/core/`는 React를 import하지 않는다. 엔진·모델을 Node(vitest)에서 단독 테스트하기 위해서다.
- 새 부품은 `src/core/library/<도메인>/`의 ComponentDefinition 데이터 + `src/ui/symbols/index.tsx`
  기호(+ 필요하면 `src/ui/equipment/sprites.tsx` 스프라이트)로 끝낸다. 솔버에 부품별 분기를 넣지 않는다 —
  동작은 `behavior` 데이터로 표현한다.
- 문서 JSON에는 `schemaVersion`이 필수이고, 포맷을 바꾸면 `src/core/storage`에 마이그레이션을 추가한다.
- 엔진(`src/core/sim/`)을 바꾸면 골든 시나리오(전기공압 A+B+A−B− 등) 테스트가 통과해야 한다.
- 주석·커밋 메시지·문서는 한국어, 주변 코드의 밀도와 말투에 맞춘다. 관련 Phase 번호를 주석에 남기는 관례가 있다.

## 위치 안내

| 무엇 | 어디 |
|---|---|
| 전기·유체 솔버, 엔진, 스냅숏 타입 | `src/core/sim/` (`electric-solver.ts`, `fluid-solver.ts`, `engine.ts`, `types.ts`) |
| 문서 조작(이동·복사·리밋 스위치 마커) | `src/core/model/operations.ts` |
| 내장 예제 (23개) | `src/core/examples/index.ts` |
| 회로도 기호 / 장비 뷰 스프라이트 | `src/ui/symbols/index.tsx` / `src/ui/equipment/sprites.tsx` |
| 자동화설비 스테이션 · PLC 래더 | `src/ui/equipment/AutomationStationSprite.tsx` · `src/ui/plc/PlcPanel.tsx` |
| 색 토큰 | `src/styles.css` (`--electric`, `--electric-return` 등) |
| 서비스 워커 · 버전 표시 | `public/sw.js`, `vite.config.ts`(`__APP_VERSION__`, 빌드 ID 스탬프), `src/app/refresh.ts` |

## 명령과 검증

- `npm run dev`(5173) / `npm test`(vitest) / `npm run build`(tsc -b + vite). 완료 보고 전 `npm test`와
  `npx tsc -b`를 통과시킨다.
- 화면에 보이는 변경은 브라우저 패널에서 직접 확인한다. `.claude/launch.json`에 `dev`(5173),
  `preview`(4173)가 있다.
  - 패널이 좁으면 레이아웃이 모바일형으로 바뀌므로 먼저 1280×850 정도로 뷰포트를 키운다.
  - 예제 로드: `window.confirm = () => true` 후 `.example-select`의 value를 설정하고 `change` 이벤트를 보낸다.
  - 시뮬레이션: `▶ 실행` 버튼 → 패널의 푸시버튼(START 등)을 pointerdown/pointerup으로 누른다.
- vitest는 프로젝트 안에서 실행한다 (scratchpad에서 돌리면 권한 오류). 임시 디버그 테스트는 끝나면 지운다.

## 배포

- `main`에 push하면 `.github/workflows/deploy.yml`이 test → build → GitHub Pages로 배포한다.
  사용자가 "커밋 푸시 배포"라고 하면 이 push까지가 배포다.
- 이 샌드박스에서는 github.io에 접속할 수 없다. 배포 확인은 api.github.com(Actions runs API)으로 한다 (`gh` CLI 없음).
- 서비스 워커는 빌드마다 새 ID가 박혀 자동 갱신되고, 상태 표시줄에 커밋 해시 버전이, 툴바에 `⟳ 최신으로`
  버튼이 있다. 캐시 관련 문제를 고칠 때 이 구조를 유지한다.
