# HYD — 공압·유압·전기·PLC 교육용 웹 시뮬레이터

특성화고 수업·자격증(공유압기능사) 대비용 회로 작도 + 시뮬레이션 웹앱.
페이즈 0~14 완료(Phase 14: 자동화설비 기능사 MPS 스테이션) — 이후 작업은 ROADMAP "후순위 후보" 참고. 문서 스키마는 v4 (ioMap channel, Phase 14-1).

`npm run dev`(5173) / `npm test` / `npm run build`. 브라우저 자동 검증 시 예제 로드는 `.example-select`에 값 설정 후 change 이벤트, `window.confirm` 우회 필요.

## 반드시 먼저 읽을 문서

- [docs/PRD.md](docs/PRD.md) — 기능 범위, 도메인별 부품 목록, non-goals
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 모듈 구조, 데이터 모델, 솔버 설계
- [docs/ROADMAP.md](docs/ROADMAP.md) — 현재 단계 확인

## 고정된 결정 (재논의 금지, 변경 시 사용자 확인)

- 웹 프론트엔드 단독 (React + TS + Vite + SVG), 백엔드 없음, 로컬 JSON 저장
- 시뮬레이션은 논리/상태 기반 — 전류·유량 수치 해석을 도입하지 않는다
- PLC는 교육용 래더(LD) 표기 — XG5000(LS산전) 표기 관례를 참고하되 비공식·비제휴임을 명시
- UI 언어는 한국어

## 핵심 규약

- `src/core/`는 React를 import하지 않는다 — 엔진·모델은 Node에서 단독 테스트 가능해야 함
- 새 부품은 ComponentDefinition 데이터 + 기호 SVG 추가로 끝낸다. 솔버에 부품별 분기 금지
- 문서 JSON에는 schemaVersion 필수, 포맷 변경 시 마이그레이션 추가
- 엔진 변경 시 골든 시나리오 테스트(전기공압 A+B+A-B- 등) 통과 확인
