# HYD 2차 코드·부품·법률/IP 리뷰

- 리뷰일: 2026-07-14
- 기준 커밋: `453706698b65c2f39e7d87d48deb3e672471998c`
- 비교 대상: `codex-review.md`, `codex-review-response.md`, `ASSET_PROVENANCE.md`, 현재 소스·테스트·프로덕션 빌드
- 결론: **REQUEST CHANGES / 아키텍처 BLOCK / 공개·상용 배포 IP 게이트 BLOCK**
- 주의: 법률 부분은 저장소와 공개 자료에 근거한 위험 검토이며, 변호사의 법률 자문을 대체하지 않는다.

## 1. 결론 요약

이번 수정은 의미가 있다. 기존 82개 테스트, TypeScript 검사, 프로덕션 빌드는 모두 통과했고 PLC 출력 연동, TOFF/CTD, 동일 솔레노이드 이름표 OR, 릴리프 압력 상한, 감압 방향, 압력 스위치 초기화 등 다수 지적은 실제로 개선됐다. 실제 Chromium에서도 48종 팔레트, 유압 예제의 40bar 표시, PLC 자기유지 실행을 확인했고 콘솔 오류는 없었다.

그러나 `codex-review-response.md`의 “전체 FIXED” 결론은 현재 코드보다 낙관적이다. 특히 다음 항목은 출시·수업 사용 전에 수정해야 한다.

1. 외부 JSON 검증기가 실행 불가능한 PLC 렁과 잘못된 부품 속성을 정상 문서로 받아들인다. 빈 PLC 렁은 첫 스캔에서 예외를 내고, 잘못된 `strokeTime`은 실린더 위치를 `NaN`으로 만들 수 있다.
2. 새로 추가한 4/3 오픈센터 유압 밸브는 중립에서 실린더 양실을 탱크로 자유 귀환시키지 않고 양쪽 모두 40bar로 가압한다.
3. 미저장 변경 보호가 dirty 상태가 아니라 `components.length`만 보므로, 부품 없는 PLC 프로그램이나 제목 수정은 확인 없이 폐기될 수 있다.
4. 전기 부하의 이름표 네임스페이스가 섞여 있어, 솔레노이드 `K1` 통전이 배선되지 않은 릴레이 `K1` 접점을 닫는 등 다른 종류의 장치를 오동작시킬 수 있다.
5. 전기·유체 고정점은 각각 5회·4회라는 고정 횟수 후 수렴 여부를 확인하지 않고 결과를 채택한다. 발진 회로나 긴 동적 유체 체인은 틱·배열 순서에 따라 결과가 달라진다.
6. `ASSET_PROVENANCE.md`는 유용한 초안이지만 독립 창작, AI 생성물의 권리 귀속, ISO/KS 출처, 경쟁 제품 접근 이력, OSS 고지를 입증하는 출시용 원장으로는 부족하다.

독립 부품 QA의 기본 시나리오 기준으로는 48종 중 46종의 주 동작이 실행됐고, 탠덤센터 1종은 부분 동작, 오픈센터 1종은 실패했다. 다만 양입력 셔틀, 릴리프 시각 상태, 이름표 중복·교차 사용처럼 정상적인 경계 조건을 포함하면 여러 부품은 “조건부 정상”으로 내려가야 한다.

## 2. 검증 범위와 실행 증거

### 2.1 실행한 검증

- `npm test -- --run`: **14 files, 82/82 passed**
- `npx tsc -b`: 성공
- `npm run build`: 성공, 68 modules transformed
- 독립 부품 프로브: 18개 중 17개 통과, 오픈센터 1개 실패
- 외부 JSON 프로브:
  - `cells: []`: `parseDocument().ok === true`, 첫 스캔에서 `TypeError`
  - `vlinks: [null]`: `parseDocument().ok === true`, 첫 스캔에서 `TypeError`
  - 잘못된 숫자 속성: 파싱을 통과하며 실행 상태가 `NaN`이 될 수 있음
- 셔틀 양입력 프로브: 6bar/2bar 입력에서 `X1=6, X2=6, A=6`으로 낮은 입력에 역급기
- 실제 Chromium 1440×1000:
  - 팔레트 48종 노출 확인
  - 감압·압력 스위치 예제에서 40bar→20bar 및 램프 연동 확인
  - PLC 자기유지 예제에서 `M0 · P0 · P20` 상태 확인
  - 콘솔 error/warning 0

### 2.2 판정 용어

| 판정 | 의미 |
|---|---|
| 정상 | 대표 시나리오와 해당 동작 경계가 테스트 또는 독립 실행으로 확인됨 |
| 조건부 | 주 동작은 되지만 이름표 중복, 동시 입력, 참조 규칙 등 유효한 사용자 입력에서 오동작 가능 |
| 부분 | 핵심 동작의 일부만 맞거나 화면 표시와 엔진 상태가 불일치 |
| 실패 | 부품명·PRD가 약속한 대표 동작이 재현되지 않음 |

## 3. 최우선 코드 발견 사항

### [BLOCK/HIGH] 외부 문서 경계 검증이 여전히 런타임 안전을 보장하지 않는다

`src/core/model/schema.ts:64-79`는 `properties`가 객체인지만 확인하고 각 부품의 `propertySchema` 타입·필수값·최솟값·최댓값을 검사하지 않는다. `src/core/model/schema.ts:117-139`는 빈 `cells`를 허용하고 `vlinks` 원소의 형태·정수 좌표·범위를 검사하지 않는다. 출력 요소의 마지막 열 규칙도 감지 후 의도적으로 허용한다. 마지막에는 `src/core/model/schema.ts:48`에서 전체 객체를 `CircuitDocument`로 단언한다.

그 결과 다음 문서들이 정상 파싱된다.

- `rung.cells: []` → `src/core/plc/scanner.ts:80-85`의 `power[0][0]`에서 예외
- `vlinks: [null]` → `src/core/plc/scanner.ts:101-107`에서 예외
- `strokeTime: "invalid"` → 액추에이터 적분 결과 `NaN`
- 임의의 `ioMap.device` 또는 입력/출력과 부품 역할이 맞지 않는 매핑

응답서 H1의 “문서 전체 경계 검증 FIXED”는 **미완료**로 수정해야 한다. 해결 시에는 다음을 한 경계 파서에서 검증해야 한다.

- `propertySchema` 기반 타입/select option/finite number/min/max/필수 속성
- PLC 렁 1행 이상, 행 폭, 고유 rung ID, 셀 device grammar, preset 범위
- `vlink` 객체·정수·행/열 범위와 마지막 행 금지
- 출력 명령의 마지막 열 강제
- `ioMap`의 `P` 디바이스 문법, 입력→접점/출력→부하 적합성, 중복 정책
- 문자열·배열·파일 크기 상한
- 파싱 성공 문서가 `SimulationEngine` 생성과 첫 tick까지 예외 없이 통과하는 회귀 테스트

### [BLOCK/HIGH] 4/3 오픈센터 밸브가 중립에서 양 실린더 포트를 가압한다

정의는 `src/core/library/hydraulic/index.ts:183-208`에서 중앙 위치를 `P-T`, `A-T`, `B-T` 연결로 선언한다. 그러나 `src/core/sim/fluid-solver.ts:270-309`는 공급이 닿은 넷을 우선 가압하고, 배기 terminal과 정확히 같은 net만 언로딩으로 분류한다.

독립 실행 결과:

```text
valve P/A/B = pressurized, 40bar
valve T     = exhausted, 0bar
cylinder HEAD/ROD = pressurized, 40bar
```

이는 “펌프 무부하 + 실린더 자유 상태”라는 정의 주석 및 PRD와 반대다. 공급 도달성과 탱크 도달성을 함께 보존하고, 탱크까지 열린 전체 경로의 상태를 일반적인 규칙으로 분류해야 한다. 오픈센터 중앙·좌·우 세 위치의 P/A/B/T 및 실린더 양실을 골든 테스트로 고정해야 한다.

### [HIGH] 미저장 변경 보호가 실제 dirty 상태가 아니다

`src/ui/editor/Toolbar.tsx:23-28`의 `confirmDiscard()`는 `document.components.length`만 본다.

- 부품 0개 + 제목 수정: 확인 없이 폐기
- 부품 0개 + PLC 프로그램 작성: 확인 없이 폐기
- 저장 또는 불러오기 직후의 변경 없는 회로: 계속 폐기 확인 표시

문서 전체의 저장/불러오기 기준 스냅숏 또는 revision을 두고 `meta`, `components`, `wires`, `plcProgram`, `ioMap`, `equipmentLayout` 모든 변경을 추적해야 한다. 새 회로·파일 열기·예제 열기·브라우저 열기의 공통 guard는 유지하되 판단 조건을 `isDirty`로 바꿔야 한다.

### [HIGH] 전기 장치 이름표가 종류별로 분리되지 않는다

`src/core/sim/engine.ts:226-250`은 모든 `elec-load`의 `label`을 `coilByLabel`에 넣은 뒤 같은 문자열의 릴레이·타이머·카운터 코일로 사용한다. 솔레노이드는 별도 OR 집합도 만들지만 기존 `coilByLabel`에서도 빠지지 않는다.

따라서 통전된 `elec.solenoid(label="K1")`이 배선되지 않은 실제 K1 릴레이 코일을 대신해 K1 접점을 닫을 수 있다. 동일 이름표의 서로 다른 타이머/카운터/릴레이가 있으면 최초 등록 부품의 종류와 preset이 문서 순서로 결정된다. `counter-reset`도 대상 카운터 이름표를 공유하면서 카운터의 일반 코일 입력에 섞인다.

권장 수정은 단순 문자열 충돌 경고가 아니라 타입이 있는 채널 분리다.

- relay/timer/counter coil 입력
- counter reset 입력
- valve solenoid 신호
- 표시 부하

같은 종류의 복수 코일 OR만 허용하고, 다른 종류가 이름표를 공유하면 실행 전 오류 또는 명시적 namespace를 사용해야 한다.

### [HIGH/ARCH] 고정점 수렴 실패를 감지하지 않는다

- 전기: `src/core/sim/engine.ts:214-259`에서 최대 5회 후 `changed`가 남아 있어도 정상 종료
- 유체: `src/core/sim/fluid-solver.ts:211-332`에서 최대 4회 후 수렴하지 않아도 결과 채택

NC K1 접점으로 K1 코일을 직접 구동하는 자기반전 회로는 snapshot/tick/tick에서 `true→false→true`로 진동하고, 종료 결과는 반복 횟수의 홀짝에 좌우된다. 12단 셔틀 동적 체인은 마지막 포트가 여러 tick 뒤에야 가압된다. `docs/ARCHITECTURE.md:96-100`의 “안정될 때까지/고정점” 설명과 실제 보장은 다르며, 같은 문서 `:112`의 “릴레이 체인은 다음 틱” 설명과도 충돌한다.

worklist 또는 그래프 크기 기반 상한, 상태 signature, cycle detection을 사용하고 결과에 `converged`, `iterations`, `cycleDetected` 진단을 노출해야 한다. 발진 회로와 6단 이상 relay chain, 12단 동적 유체 chain을 테스트해야 한다.

## 4. `codex-review-response.md` 주장 재검증

| 항목 | 2차 판정 | 검토 결과 |
|---|---|---|
| H1 외부 문서 검증 | **미완료/BLOCK** | 빈 렁·잘못된 vlink·속성 타입이 통과하고 런타임 예외/NaN 발생 |
| H2 PLC→릴레이/타이머/카운터 | 완료 | PLC 강제 출력이 전기 고정점과 디바이스 갱신에 반영됨. 독립 PLC→카운터도 통과 |
| H3 TOFF/CTD 및 D 범위 | 완료 | TOFF·CTD 구현. D/MOV/비교는 PRD에서 MVP 제외로 명시 |
| H4 유압 범위 | **미완료/BLOCK** | 오픈센터 정의는 추가됐지만 중앙 동작이 실패 |
| H5 미저장 보호 | **부분** | 공통 guard는 생겼으나 dirty가 아니라 부품 수 기준 |
| H6 릴리프 | **부분** | 단순 회로의 압력 cap은 동작. 기호의 작동 표시는 실제 relief 활성 상태가 아님 |
| M1 오프라인 프리캐시 | **부분** | 설치 실패를 삼키고 새 SW를 활성화해 정상 구 캐시를 지울 수 있음 |
| M2 동일 솔레노이드 label OR | 완료 | 순서 양방향 회귀 테스트 통과 |
| M3 포트 kind/참조 | 완료 | 현재 검증 범위 안에서 잘못된 배선 참조·kind 거부 |
| M4 삭제 시 ioMap 정리 | 완료 | 삭제 연산과 회귀 테스트 확인 |
| M5 틱 계약 문서 | **부분** | 4.1과 4.2의 릴레이 체인 설명이 상충하고 수렴 실패 계약이 없음 |
| M6 UI E2E/60fps | **미완료** | 응답서는 ROADMAP 등재를 주장하지만 `docs/ROADMAP.md:107-111`에 없음 |
| M7 localStorage 쓰기 실패 | 완료 | save 결과와 사용자 안내 확인 |
| M8 손상 localStorage 격리 | 완료 | 엔트리별 shape 검증 확인 |
| M9 드래그 중 undo/redo | 완료 | 진행 중 드래그 취소 후 history 적용 |
| M10 라우팅 | **부분** | 같은 방향 문제는 개선됐지만 서로 등진 반대 방향 포트가 overshoot·retrace |
| M11 PLC 매핑 유체 포트 | 완료 | 전기 포트만 미배선 면제 |
| L1 README 수치 | 완료 | 20 공압/18 예제/82 테스트와 일치 |
| L2 파일 취소 Promise | **부분** | focus 1초 fallback이 큰 정상 파일의 `file.text()`와 경쟁 가능 |
| L3 문서 lang | 완료 | 언어 초기화·토글과 동기화 |

추가 문서 오류:

- `codex-review-response.md:27`은 M6을 ROADMAP 후순위에 넣었다고 하나 실제 후순위 목록에는 없다.
- `codex-review-response.md:70`의 미터인·카운터밸런스·중복 label 후순위 등재 주장도 실제 후순위 목록과 맞지 않는다.
- `codex-review-response.md:78`은 “아래 세션 기록”을 참조하지만 그 줄에서 문서가 끝난다.
- `docs/ARCHITECTURE.md:134`는 P/M/T/C/D와 T/C 상태기계 재사용을 말하지만 PRD는 D를 MVP 제외했고 실제 PLC scanner는 별도 T/C 상태를 가진다.
- `docs/ARCHITECTURE.md`의 모듈 트리에는 실제로 없는 `actuator.ts`와 다른 PLC 경로가 남아 있다.
- `docs/ROADMAP.md:55`의 “100개 60fps 완료”는 엔진 평균 tick 테스트만으로는 입증되지 않는다. 실제 UI 루프는 50Hz이며 브라우저 frame timing을 측정하지 않았다.

## 5. 부품 48종 재검증

### 5.1 공압 20종

| 부품 type | 판정 | 재검증 결과와 개선 사항 |
|---|---|---|
| `pneu.source` | 정상 | 설정 압력 6bar 공급 확인 |
| `pneu.service-unit` | 정상 | 논리 모델에서 P→A 6bar 전달. 여과·윤활·정량 레귤레이션은 제품 non-goal과 일치 |
| `pneu.silencer` | 정상 | 배기 terminal로 동작 |
| `pneu.tee` | 정상 | 세 포트 압력 분기 확인 |
| `pneu.valve.3-2-manual` | 정상 | 조작 시 공급, 해제 시 배기 |
| `pneu.valve.3-2-roller` | 조건부 | 유일한 실린더 label에서는 끝단 전환. 중복 label이면 첫 실린더만 선택하므로 중복 금지/경고 필요 |
| `pneu.valve.5-2-manual` | 정상 | 복동 실린더 전·후진 확인 |
| `pneu.valve.5-2-double-pilot` | 정상 | 양측 파일럿 전환과 무신호 메모리 확인 |
| `pneu.valve.5-2-single-pilot` | 정상 | 파일럿 전환과 스프링 복귀 확인 |
| `pneu.valve.3-2-solenoid` | 조건부 | 고유 Y label에서는 전환. 다른 장치 종류와 label 충돌 검증 필요 |
| `pneu.valve.5-2-solenoid` | 조건부 | 독립 프로브에서 ON 전진/OFF 복귀. label namespace 문제 영향 |
| `pneu.valve.5-2-double-solenoid` | 조건부 | 좌·우 전환/메모리는 동작. 양측 동시 ON은 현재 위치 유지하며 경고 없음 |
| `pneu.valve.5-3-double-solenoid` | 조건부 | 무신호 중앙 복귀·실린더 hold 확인. 동시 ON과 label 충돌 정책 필요 |
| `pneu.cylinder.double` | 정상 | 양실 가압/배기 조합으로 전·후진 적분 |
| `pneu.cylinder.single` | 정상 | 가압 전진·배기 시 스프링 후진 |
| `pneu.speed-controller` | 정상 | B→A 개도 계수 감속 확인 |
| `pneu.shuttle` | **부분** | 한쪽 입력의 비활성측 격리는 개선. 두 입력 6/2bar 동시 가압 시 두 입력과 출력이 6bar로 합쳐져 저압측 역급기 |
| `pneu.two-pressure` | 정상 | 양 입력이 있어야 출력, 6bar+2bar→2bar 확인 |
| `pneu.quick-exhaust` | 정상 | 공급 시 충전, 공급 해제 시 A→R 직접 배기 |
| `pneu.pressure-switch` | 정상 | 6bar에서 ON, 2bar에서 OFF 및 램프 연동 |

셔틀은 `src/core/sim/fluid-solver.ts:220-227`에서 양 입력이 모두 가압되면 두 입력을 모두 출력에 양방향 연결한다. 높은 입력 하나만 선택하고 동압 tie 규칙을 정해야 한다.

### 5.2 유압 16종

| 부품 type | 판정 | 재검증 결과와 개선 사항 |
|---|---|---|
| `hyd.power-unit` | 정상 | P 설정압 공급, T 탱크 terminal. 정량 펌프 유량은 non-goal |
| `hyd.tank` | 정상 | 귀환 terminal |
| `hyd.tee` | 정상 | 3방향 분기 |
| `hyd.gauge` | 정상 | 40bar/20bar 표시 및 300bar scale 수정 확인 |
| `hyd.relief` | **부분** | 탱크 연결 시 40bar 공급을 20bar로 제한하고, 80bar 설정/탱크 미연결에서는 비작동. 다만 화면은 P 압력만으로 작동을 추정해 실제와 어긋남 |
| `hyd.valve.4-2-lever` | 정상 | P-A/B-T ↔ P-B/A-T 수동 전환 |
| `hyd.valve.4-3-closed-solenoid` | 조건부 | 중립 전 포트 차단 및 실린더 hold. 공통 solenoid label 정책 영향 |
| `hyd.valve.4-3-tandem-solenoid` | **부분** | T 귀환선은 exhausted, A/B는 차단. 펌프측 P는 pressurized로 남아 “펌프 무부하” 의미가 불완전 |
| `hyd.valve.4-3-open-solenoid` | **실패** | 중립에서 P/A/B와 실린더 양실이 40bar로 가압됨 |
| `hyd.reducing` | 정상 | 정방향 cap, 역방향 cap 없음 확인 |
| `hyd.pressure-switch` | 정상 | 초기 snapshot부터 임계 접점과 램프 연동 |
| `hyd.check` | 정상 | A→B 허용, B→A 차단 독립 확인 |
| `hyd.pilot-check` | 정상 | 역류 차단, X 가압 시 역류 허용 확인 |
| `hyd.flow-control` | 정상 | 체크 내장 방향과 역방향 개도 감속 확인 |
| `hyd.cylinder.double` | 정상 | 전·후진 및 차단 위치 유지 |
| `hyd.motor` | 정상 | A/B 압력 방향에 따른 정·역회전 |

릴리프의 코어 압력 상한은 이번 수정으로 실제 개선됐다. 그러나 `src/ui/symbols/index.tsx:702-711`은 `levelP >= setpoint`만으로 개방 표시를 한다. T 미연결 상태에서 40bar/20bar여도 열림으로 보이고, 공급압이 설정압과 우연히 같은 경우에도 열림으로 보인다. 솔버가 `reliefActive` 같은 명시 상태를 스냅숏에 제공하고 기호는 그 상태만 렌더해야 한다.

### 5.3 전기 12종

| 부품 type | 판정 | 재검증 결과와 개선 사항 |
|---|---|---|
| `elec.supply-24v` | 정상 | 양전원 도달성 시작점 |
| `elec.supply-0v` | 정상 | 귀환 전원 도달성 시작점 |
| `elec.pushbutton` | 정상 | NO/NC, 순간/유지 입력 |
| `elec.limit-switch` | 조건부 | 실린더 끝단 접점 동작. 중복 cylinder label이면 첫 부품만 감지 |
| `elec.relay-contact` | 조건부 | 정상 label에서는 디바이스 출력 추종. 교차 종류 label과 발진 회로 진단 없음 |
| `elec.relay-coil` | 조건부 | 같은 tick 접점 반영과 PLC 출력 연동 확인. 다른 종류 부하가 동일 label을 대신 구동 가능 |
| `elec.timer` | 조건부 | on-delay/off-delay 모두 동작. 중복 label의 mode/preset은 첫 부품이 결정하며 전기식 elapsed는 snapshot에 없음 |
| `elec.counter` | 조건부 | 상승 edge 계수와 preset 접점 출력 확인. 중복 label·reset channel 혼합 및 count snapshot 부재 |
| `elec.counter-reset` | 조건부 | 대상 카운터 0 초기화 확인. 일반 coil 집계와 분리 필요 |
| `elec.solenoid` | 조건부 | 밸브 label 연동과 동일 label OR 확인. 릴레이/타이머/카운터 label을 오염시킬 수 있음 |
| `elec.lamp` | 정상 | 완전 회로와 PLC 출력에서 점등 |
| `elec.buzzer` | **부분** | 논리 energized 및 시각 표시 확인. 실제 음향 출력은 없음. 의도된 범위라면 PRD/이름에 “표시형”으로 명시 필요 |

### 5.4 PLC 명령·연동

| 항목 | 판정 | 결과 |
|---|---|---|
| NO/LOAD, NC/LOADB | 정상 | 접점 논리와 브라우저 래더 확인 |
| OUT | 정상 | 출력 이미지와 매핑 부하 반영 |
| SET/RST | 정상 | 유지·해제 및 T/C reset 경로 확인 |
| TON/TOFF | 정상 | on/off delay 경계 확인 |
| CTU/CTD | 정상 | 상승 edge 계수, preset 감산·0 출력 확인 |
| PLC→relay→contact→lamp | 정상 | 같은 tick 연쇄 확인 |
| PLC→timer/counter | 정상 | timer 지연 및 counter 2펄스 독립 확인 |
| PLC→solenoid→cylinder | 정상 | 내장 연속 왕복/OR 테스트 확인 |
| 편집기 외부 JSON 안전성 | **실패** | 빈 렁·잘못된 vlink·device/preset 검증 미완료 |
| ioMap 의미 검증 | **부분** | componentId 존재만 확인. device 문법과 direction↔부품 역할 적합성 없음 |

## 6. 그 밖의 코드·제품 개선 사항

### MEDIUM

1. **서비스 워커의 부분 프리캐시 활성화** — `public/sw.js:11-36`은 index/asset fetch 실패를 삼키고 `skipWaiting()`한다. activate 단계는 정상 구 캐시를 삭제할 수 있어 일시적 네트워크 실패가 오프라인 앱을 망가뜨릴 수 있다. 필수 shell 전체 성공 전 install을 실패시켜야 한다.
2. **서로 등진 포트 라우팅** — `src/core/routing.ts:38-48`은 반대 방향이면 상대 위치를 보지 않고 마주본다고 가정한다. `(100,0,right) → (0,0,left)`가 양쪽 바깥으로 overshoot한 뒤 되짚는다.
3. **ioMap 의미 검증** — `src/core/sim/validate.ts:80-84`는 componentId만 본다. `device="TYPO"`, output→접점, input→부하를 거부하거나 경고해야 한다.
4. **릴리프 UI 상태** — 엔진 결과가 아니라 압력값을 재추론해 거짓 활성 표시.
5. **성능 완료 주장** — 현재 100부품 fixture는 서로 독립된 정적 공압 cell의 엔진 tick 평균만 잰다. 전기/PLC 고정점, 동적 유체 chain, 다중 relief, React/SVG 렌더, p95 frame time을 포함해야 한다.
6. **JSON 가용성 제한** — `src/app/file.ts:65`는 파일 전체를 메모리에 올리고 크기 제한 없이 동기 검증한다. 파일 byte, component/wire/rung/row/waypoint 수, 문자열 길이 상한이 필요하다.

### LOW

1. `src/app/file.ts:76-92`의 focus 1초 fallback은 큰 정상 파일을 읽는 중 취소로 먼저 resolve할 수 있다. 선택 시작 여부를 즉시 표시해야 한다.
2. `src/core/storage/index.ts:100-107`은 delete 저장 실패를 삼키지만 Toolbar는 항상 삭제 성공을 표시한다.
3. localStorage 문서명을 일반 객체 키로 사용하므로 `__proto__` 같은 키는 `Object.create(null)` 또는 `Map`으로 방어하는 편이 안전하다.

## 7. 법률/IP 재검토

### 7.1 법적 결론의 범위

저장소와 번들에서는 Automation Studio/V-AMT의 소스 코드, 로고, 독점 파일 형식 또는 외부 이미지의 직접 복제 증거를 찾지 못했다. 기능적으로 유사한 교육용 공압·유압·전기·PLC 시뮬레이터를 만드는 아이디어 자체와, 그 아이디어의 구체적인 코드·화면·그래픽·교재 표현은 구분해야 한다. WIPO도 저작권은 아이디어·절차·작동 방법이 아니라 표현을 보호한다고 설명한다([WIPO](https://www.wipo.int/en/web/copyright/protection)).

다만 “침해 증거를 찾지 못함”은 “독립 창작이 입증됨” 또는 “법적 문제가 없음”과 같지 않다. 현행 한국 저작권법은 저작물을 인간의 사상 또는 감정을 표현한 창작물로 정의하며, 교육 목적도 자동 면책이 아니다([2026-05-11 시행 저작권법](https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260511&lsiSeq=283335&urlMode=lsInfoP)). 공개·상용 배포 전에는 권리자와 변호사가 사실관계를 확인해야 한다.

### 7.2 Automation Studio와 V-AMT

두 제품의 공식 소개는 HYD와 기능 영역이 상당히 겹친다.

- Automation Studio Educational Edition은 유공압·전기·PLC 회로 작도, 시뮬레이션, 상태 색상, 일러스트 라이브러리, 가상 훈련을 제공한다([공식 제품 페이지](https://www.famictech.com/en/Products/Automation-Studio/Educational-Edition)).
- V-AMT는 공압·유압·전기·PLC 가상 실습실, 2D 회로 작도실, XG5000/PLC 연동, 자격증 예제를 소개한다([공식 제품 페이지](https://www.cubictek.co.kr/sub/sub02_01.php?cat_no=2&idx=3&mode=view&offset=)).

이 기능 목록의 중첩만으로 저작권 침해를 단정할 수 없다. 위험은 다음 구체적 표현을 가져왔는지에 달려 있다.

- 화면 구획, 패널 순서, 색상·아이콘·툴바 조합
- 개별 기호의 고유 치수·배치와 장비 스프라이트
- 예제 회로의 선택·배열·설명 문구
- 제품 파일, 매뉴얼, 카탈로그, 스크린샷, 데이터베이스
- 코드·프로토콜·비공개 동작 규칙

Famic의 공개 EUSLMA는 소프트웨어·문서의 복제, 변형, 역공학, 파생물 작성을 제한하고, 한편 정당한 라이선시가 소프트웨어로 만든 프로젝트의 소유에 관한 조항도 둔다([공개 EUSLMA PDF](https://www.famictech.com/Portals/0/PDF/F7510105-EN%20Automation%20Studio%20EUSLMA.pdf)). 어느 조항이 적용되는지는 실제로 누가 어떤 판본에 동의했고 무엇에 접근했는지에 달려 있다.

V-AMT의 공개 제품 페이지에서 제품 EULA는 확인하지 못했다. 큐빅테크 홈페이지 이용약관은 홈페이지 정보의 복사·변경·제공을 제한하지만 이를 V-AMT 제품 EULA로 간주해서는 안 된다([홈페이지 이용약관](https://www.cubictek.co.kr/member/terms.php)). 구매계약, 설치 화면 약관, 매뉴얼 권리고지를 별도로 확보해야 한다.

권장 조치:

1. 기여자별 Automation Studio/V-AMT 설치본·매뉴얼·카탈로그·스크린샷·프로젝트 파일 접근 여부를 날짜와 함께 서명 확인한다.
2. 접근이 있었다면 당시 라이선스, 수락 EULA 판본, 허용 목적을 확보한다.
3. 독립 리뷰어가 합법적으로 접근 가능한 공개 화면만으로 side-by-side 검토를 하고, 유사점이 기능적 제약인지 선택 가능한 표현인지 구분해 기록한다.
4. 공개 마케팅에서 “원조 프로그램을 복제/대체” 같은 표현을 피하고, 독립적인 교육용 제품이라는 설명만 사용한다.
5. `codex-review.md`는 역사적 감사 문서로 “현재 상태를 대변하지 않음”을 표시하고, 외부 공개 여부를 별도로 결정한다.

### 7.3 `ASSET_PROVENANCE.md`의 핵심 문제

현재 원장은 다음을 검증된 사실처럼 단정한다.

- 모든 코드·기호·스프라이트·아이콘·예제가 Claude Code로 새로 작성됨
- Git 이력이 전체 변경 기록임
- 외부 자료를 트레이싱하지 않았음
- 경쟁 제품 설치본·매뉴얼·카탈로그·스크린샷을 열람하지 않았음
- ISO/KS/교재/시험자료를 복제하지 않았음

하지만 최초 커밋은 66개 파일, 13,181행의 완성 결과를 한 번에 반영했다. Git은 그 이전의 제작 과정, 프롬프트, 초안, 참고자료 접근을 증명하지 못한다. `ASSET_PROVENANCE.md:45-48`도 기여자 사실확인, EULA, chain of title이 미완료라고 인정한다. 따라서 1절은 “사실 기재”가 아니라 다음 세 층으로 나눠야 한다.

- **저장소로 검증됨**: 외부 `<image>`, data URI, 제조사 로고, 독점 포맷 parser가 발견되지 않음 등
- **기여자 진술 필요**: 무엇을 보지 않았고 복제하지 않았는지
- **법률 판단 대기**: 표현 유사성, 계약 적용, 권리 귀속

“모든 그래픽은 JSX”라는 문장도 `public/icon.svg`가 있으므로 문자 그대로 부정확하다. “외부 그래픽을 임베드하지 않았고, 회로 기호·장비 스프라이트는 JSX 기본 도형, 앱 아이콘은 저장소 내 SVG로 제작했다”처럼 고쳐야 한다.

### 7.4 AI 생성물과 권리 귀속

Anthropic Commercial Terms는 적용 법률이 허용하는 범위에서 고객이 출력을 소유하도록 Anthropic의 권리를 양도하지만, 고객에게 출력의 적합성·정확성을 검토할 책임을 둔다. IP indemnity도 입력, 출력 수정·다른 기술과의 결합, 알고 있거나 알 수 있었던 침해, 특허, 상표 사용 등에 예외가 있다([Commercial Terms](https://www.anthropic.com/legal/commercial-terms)). Consumer Terms도 Anthropic이 가진 출력 권리가 있다면 양도하지만, 입력 권리와 결과 검증 책임은 사용자에게 있다([Consumer Terms](https://www.anthropic.com/legal/consumer-terms)).

따라서 “Claude가 만들었으므로 권리가 모두 해결됐다”는 결론은 성립하지 않는다. 어느 약관이 적용됐는지, 출력이 제3자 표현을 포함하는지, 인간의 창작적 기여가 무엇인지 별도로 확인해야 한다. 한국저작권위원회도 생성형 AI 활용 저작물의 등록에서 인간의 창작적 기여와 AI 산출 부분을 구분하는 실무 안내를 제공한다([2025 생성형 AI 활용 저작물 등록 안내서](https://www.copyright.or.kr/information-materials/publication/research-report/view.do?brdclasscode=&brdclasscodeList=&brdctsno=54253&etc1=&etc2=&nationcode=&nationcodeList=&pageIndex=3&searchTarget=SUBJECT&searchText=&searchkeyword=)).

원장에는 최소한 다음을 기록해야 한다.

- 제공자/제품/모델, 사용일, 계정 주체와 Consumer/Commercial 구분, 적용 약관 버전
- 주요 프롬프트·출력·세션 ID 또는 보존 위치와 hash
- 프롬프트에 넣은 제3자 자료와 그 사용 권한
- 인간 작성자가 선택·배열·수정·검증한 부분과 commit/diff
- 직원·외주·공동 기여자의 고용/위탁 계약과 IP 양도
- Claude 외 Codex 등 다른 AI 도구가 코드·문서·자산에 사용된 이력

### 7.5 ISO/KS와 표준 기호

`README.md`와 PRD는 ISO 1219 기반·준수를 말하지만, 원장은 ISO 문서를 보지 않고 기억과 공개 관례로 작도했다고 한다. 이 상태에서는 판본 적합성도, ISO 콘텐츠를 복제하지 않았다는 경위도 동시에 입증하기 어렵다.

ISO 1219-1:2012는 유공압 기호의 기본 요소와 작성 규칙을 정하고 있으며 Amendment 1:2016이 있다([공식 표준 페이지](https://www.iso.org/standard/60184.html)). ISO는 표준 콘텐츠의 복제·배포·변형에 권리와 이용 조건이 있음을 고지한다([ISO copyright](https://www.iso.org/copyright.html)).

따라서 둘 중 하나를 선택해야 한다.

1. 정식 판본을 합법적으로 확보하고, 허용 범위 안에서 기호별 적합성 대조 기록을 작성한다. 라이선스가 허용하지 않으면 표준 PDF·도면을 저장소나 AI 프롬프트에 넣지 않는다.
2. 검증 전까지 “ISO 1219 준수”를 “일반적인 유공압 기호 관례를 바탕으로 한 교육용 표현”으로 낮추고, 정확한 표준 적합성을 보증하지 않는다.

KS 전기 기호와 자격증 예제도 정확한 표준 번호·판본·교재·출제기관 자료를 특정하거나, 특정 자료를 보지 않았다는 기여자 진술을 분리해야 한다.

### 7.6 XG5000 명칭

README의 “LS ELECTRIC과 무관한 독립 구현, `.xgp` 비호환, 로고 미사용” 고지는 이전보다 안전하다. 실제 XG5000은 LS ELECTRIC이 제공하는 PLC 프로그래밍·디버깅 소프트웨어다([공식 제품 페이지](https://www.ls-electric.com/ko/product/category/BBB001012)).

남은 개선:

- 앱 내부 PLC 패널 또는 About에도 같은 비제휴·비호환 고지를 표시한다.
- “호환”, “공식”, “인증”, “대체품”처럼 오인을 키우는 표현을 쓰지 않는다.
- 외부 공개 문서에서 “XG5000 스타일”이 꼭 필요하지 않으면 “국내 PLC 교육 관례”로 중립화한다.
- 등록상표 여부와 지정상품은 별도 상표 조사 없이 단정하지 않는다.

### 7.7 오픈소스 라이선스와 배포 고지

`ASSET_PROVENANCE.md`는 package.json 범위만 적어 실제 배포 구성요소 원장으로 부족하다.

잠금파일 기준 주요 production dependency는 다음과 같다.

- React 18.3.1 — MIT
- ReactDOM 18.3.1 — MIT
- Zustand 5.0.14 — MIT (`ASSET_PROVENANCE.md`의 `^5.0.3`은 설치 버전이 아니라 범위)
- Scheduler 0.23.2 — MIT
- production dependency tree의 loose-envify 1.4.0, js-tokens 4.0.0도 최종 번들 포함 여부를 확인해야 함

현재 저장소와 `dist`에는 전체 MIT 저작권·허락 고지가 없다. MIT는 소프트웨어의 복사본 또는 상당 부분에 저작권 고지와 허락 고지를 포함하도록 요구한다([React 18.3.1 LICENSE](https://github.com/facebook/react/blob/v18.3.1/LICENSE), [Zustand v5.0.14 LICENSE](https://github.com/pmndrs/zustand/blob/v5.0.14/LICENSE)). `NOTICE 생성 여부`는 단순 선택 사항이 아니라 실제 배포물이 라이선스 조건을 충족하는지 확인해야 하는 항목이다.

필요 조치:

- lockfile 기준과 실제 bundle 기준을 구분한 SBOM
- `THIRD_PARTY_NOTICES.txt`에 정확한 버전, 저작권자, 전체 라이선스 본문
- GitHub Pages에서도 접근 가능한 라이선스/고지 페이지
- 프로젝트 자체 코드·문서·자산의 LICENSE 및 에셋별 조건
- 릴리스마다 SBOM/NOTICE를 다시 만드는 자동 검사

## 8. `ASSET_PROVENANCE.md` 권장 개편 형식

현재의 자산군 단위 서술 대신 다음 열을 가진 행 단위 원장을 권장한다.

| 필드 | 내용 |
|---|---|
| Asset ID / 경로 | 코드 모듈, 기호, 스프라이트, 아이콘, 예제, 문서의 실제 경로 |
| 분류 | source / symbol / equipment art / icon / example / text / dependency |
| 작성자·권리 주체 | 개인, 회사, 고용·위탁 관계 |
| 생성·수정일 | 최초 생성과 주요 변경일 |
| 원본·초안 | 스케치, 세션, prompt/output, commit, hash 보존 위치 |
| AI 사용 | 제공자·모델·계정 유형·적용 약관·인간 수정 범위 |
| 입력/참고 자료 | URL·문서명·판본·열람일·캡처 hash |
| 라이선스/허락 | 사용 조건, 계약, 표준 라이선스, 공개 여부 |
| 경쟁 제품 접근 | 기여자 서명 진술 및 접근 자료 범위 |
| 독립성 검토 | side-by-side 검토자·일자·결론·교체 조치 |
| 상태 | approved / needs evidence / replace / exclude from release |

원장 맨 앞에는 다음을 둔다.

- 대상 commit/hash와 작성·승인자
- “저장소 관찰”, “기여자 진술”, “외부 공식 자료”, “법률 판단”의 증거 등급
- 미확인 사항은 단정하지 않는 원칙
- 서명·승인 이력과 변경 로그
- 공개용 원장과 영업비밀/계약 자료가 포함된 내부 증빙 보관소의 분리

## 9. 권장 수정 우선순위

### P0 — 완료 주장과 공개 배포 전에 필수

1. 외부 JSON을 property/PLC/vlink/ioMap/size까지 실제 파싱하고 engine 첫 tick 회귀 추가
2. 오픈센터 및 탠덤센터의 탱크 도달성·언로딩 의미 수정
3. 문서 전체 dirty tracking 도입
4. 전기 device/solenoid/reset 이름표 channel 분리와 충돌 검증
5. 전기·유체 수렴/cycle 진단 도입
6. `codex-review-response.md`의 H1/H4/H5/H6/M1/M5/M6/M10/L2 상태를 현재 판정으로 수정
7. `ASSET_PROVENANCE.md`를 증거 등급·자산별 원장으로 개편하고 기여자 서명 확보
8. 실제 bundle 기준 SBOM, `THIRD_PARTY_NOTICES`, 프로젝트 LICENSE 확정

### P1 — 다음 안정화 반복

1. 셔틀 양입력 고압 선택과 tie 정책
2. 릴리프 active 상태를 core snapshot으로 노출
3. service worker 원자적 install/activate
4. ioMap device 문법·방향/부품 적합성
5. 중복 실린더/device label 정책
6. 라우팅의 facing-away 4방향 회귀
7. 파일 크기/복잡도 제한, 큰 파일 worker 처리
8. 실제 브라우저 E2E와 60fps/p95 frame timing

### P2 — 문서·사용성

1. ARCHITECTURE 모듈 트리와 틱 계약을 실제 구현에 맞춤
2. 실제 deferred 항목을 ROADMAP 후순위에 등록
3. 앱 내부 XG5000 비제휴 고지
4. 전기 timer/counter 상태를 component snapshot에도 표시할지 결정
5. 부저의 실제 음향 또는 “시각 표시형 부저” 범위 명시

## 10. 최종 승인 기준

다음 조건 전에는 “Phase 0~10 기능 완료”, “48종 정상”, “ISO 1219 준수”, “공개 배포 법률 검토 완료”라고 표시하지 않는 것이 안전하다.

- malformed JSON이 파싱 또는 첫 tick에서 안전하게 거부됨
- 오픈센터 중립에서 P/A/B/T와 실린더 양실이 정의된 언로딩 상태를 보임
- 제목/PLC-only 변경을 포함한 dirty-loss E2E 통과
- 교차 종류 label로 다른 장치가 오동작하지 않음
- 비수렴 회로가 진단되고 긴 동적 체인이 정해진 계약대로 처리됨
- 48종 정상/경계/오류 시나리오 conformance suite 통과
- 브라우저 저장·불러오기·편집·시뮬레이션 E2E 및 frame timing 통과
- 자산별 provenance, 경쟁 제품 접근 진술, AI chain of title, ISO/KS 근거, SBOM/NOTICE/Licenses가 승인됨
- 독립 IP 리뷰와 필요 시 한국 변호사의 공개·상용 배포 검토 완료

현재 결론은 **기능 수정은 상당 부분 성공했으나, 응답서의 전면 완료 판정은 철회해야 하며 코드 안정화와 IP 증빙이 모두 더 필요하다**이다.
