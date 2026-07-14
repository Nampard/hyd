# codex-review.md 대응 결과

- 대응일: 2026-07-14
- 대응 범위: 리뷰의 기능·아키텍처 발견 사항 전체. IP/법률 항목은 "사용자 결정 필요"로 분리
- 검증: `npm test` 82개 통과 (기존 50 + 회귀 32 추가), `tsc` 클린, `npm run build` 성공

## HIGH

| 항목 | 상태 | 조치 |
|---|---|---|
| H1 외부 문서 검증 불완전 | **FIXED** | `parseDocument()`가 문서 전체를 경계 검증: 부품(등록 타입·ID 유일성·좌표·회전·속성 객체), 배선(참조 존재·포트 kind 일치·경유점), PLC 프로그램(렁/셀 구조·kind), ioMap(참조 무결성), equipmentLayout(참조·좌표). `src/core/model/schema.ts`. 회귀 테스트 8건 (`schema-validation.test.ts`) — 미등록 타입·중복 ID·끊어진 참조·kind 불일치·잘못된 회전/좌표/PLC 셀 모두 `ok:false` |
| H2 PLC 출력→릴레이/타이머/카운터 미연동 | **FIXED** | PLC 출력을 `plcForced` 맵에 기록하고 전기 고정점이 회로 통전과 OR 결합 → 디바이스 코일 집계·접점·재솔브가 같은 틱에 일관 수행. PLC 스캔 후 출력 변경 시 고정점+디바이스 전이 재실행. `src/core/sim/engine.ts`. 통합 테스트: PLC→릴레이 접점→램프, PLC→타이머 지연 점등 (`plc-integration.test.ts`) |
| H3 PRD 필수 PLC 범위 미구현 | **FIXED (구현+정정 병행)** | TOFF·CTD를 모델/스캐너/에디터/모니터에 구현 (`plc/model.ts`, `plc/scanner.ts`, `PlcPanel.tsx`), 경계 테스트 추가 (`plc-scanner.test.ts`). D 디바이스·MOV/비교는 워드 연산으로 비트 논리 교육 범위를 벗어나므로 PRD에서 후순위로 명시 이동 (`docs/PRD.md`) |
| H4 유압 완료 주장 vs 실제 범위 | **FIXED (구현+정정 병행)** | 4/3 오픈 센터 밸브 추가 (`hyd.valve.4-3-open-solenoid` — 부품·기호). ROADMAP Phase 3 예제 설명을 실제 범위로 정정하고 미터인·카운터밸런스 전용 예제는 후순위로 명시 |
| H5 새 회로/열기의 미저장 작업 폐기 | **FIXED** | `confirmDiscard()` 공통 정책을 새 회로·파일 열기·예제·브라우저 열기에 동일 적용 (`Toolbar.tsx`) |
| H6 릴리프 밸브 no-op | **FIXED** | 범용 `pressure-relief` behavior 롤 신설. 솔버가 탱크 경로 도달성(배기 전파)을 확인한 뒤 압력 포트가 속한 유로 영역 전체의 레벨에 설정압 상한을 적용. 부품별 분기 없음. 기호는 작동 시 채움+유로 정렬로 개방 상태 표시, 설정압 병기. 경계 테스트 4건: 설정 이하/초과/탱크 미연결/20↔80bar 상이성 (`solver-fixes.test.ts`) |

## MEDIUM

| 항목 | 상태 | 조치 |
|---|---|---|
| M1 첫 방문 후 오프라인 미보장 | **FIXED** | SW install 단계에서 index.html을 받아 참조 자산(해시 파일명 포함)까지 프리캐시. activate는 `hyd-` 접두사 캐시만 정리 (WATCH 항목 동시 해소). 캐시 버전 hyd-v2 (`public/sw.js`) |
| M2 동일 label 솔레노이드 순서 의존 | **FIXED** | 솔레노이드도 label별 OR 집계 후 집합을 원자적으로 교체. 순서 뒤집은 회귀 테스트 (`plc-integration.test.ts` it.each) |
| M3 포트 타입 불일치 실행 전 경고 부재 | **FIXED (H1로 해소)** | 문서 경계에서 배선 kind·참조를 거부하므로 잘못된 문서가 솔버에 도달하지 않음. 리뷰 권고안("H1 우선 적용") 채택 |
| M4 부품 삭제 시 ioMap 잔존 | **FIXED** | `deleteComponent()`가 ioMap 항목도 정리. 회귀 테스트 포함 |
| M5 틱 의미와 문서 불일치 | **FIXED** | 구현 기준 틱 계약(전기 고정점→디바이스→PLC→밸브→유체→적분, 초기 유체→전기→유체)을 ARCHITECTURE 4.1에 명문화 |
| M6 UI 회귀 테스트·렌더링 60fps 미검증 | **DEFERRED** | 브라우저 E2E·프레임 계측은 도구 도입(Playwright 등)이 필요한 별도 작업. ROADMAP 후순위에 등재 (아래 "미조치·후속" 참조) |
| M7 localStorage 쓰기 실패 미처리 | **FIXED** | `save()`가 boolean 반환, 실패 시 상태바에 용량/사생활 보호 모드 안내 + .json 대안 제시 |
| M8 손상된 localStorage 값으로 렌더 중단 | **FIXED** | `read()`가 shape·entry 단위 검증으로 손상 항목 격리. 손상 데이터 테스트 기존 유지 |
| M9 드래그 중 undo가 redo 이력 파괴 | **FIXED** | undo/redo 진입 시 진행 중 드래그를 원자적으로 취소(시작 스냅숏 복원 후 정리) |
| M10 같은 방향 일직선 포트 역주행 | **FIXED** | 마주보는 방향만 직선 허용, 같은 방향 일직선은 수직 우회(dogleg). 4방향 테이블 테스트 (`schema-validation.test.ts`) |
| M11 PLC 매핑 부품의 유체 포트 검사 면제 | **FIXED** | 면제를 전기 포트로 한정 — 압력 스위치 유체 포트는 계속 배관 검사 |

## LOW

| 항목 | 상태 | 조치 |
|---|---|---|
| L1 README 수치 불일치 | **FIXED** | 공압 20종·예제 18종·테스트 82개로 갱신, 유압 라인에 릴리프(동작)·오픈 센터·모터 반영 |
| L2 파일 선택 취소 시 Promise 미완료 | **FIXED** | `cancel` 이벤트 + 포커스 복귀 폴백으로 항상 완료. `cancelled` 플래그로 오류와 구분 |
| L3 언어 전환 시 문서 lang 미갱신 | **FIXED** | 초기화·토글 시 `document.documentElement.lang` 동기화 |

## 요소별 감사 지적 (HIGH/MEDIUM 외)

| 항목 | 상태 | 조치 |
|---|---|---|
| 셔틀밸브 역급기 | **FIXED** | 가압된 입력만 출력과 연결. 양측 무압 시 출력→입력 일방향 배기만 허용. 테스트: 비활성 입력 비가압 확인 |
| 2압밸브 출력 레벨이 높은 쪽 | **FIXED** | 두 입력 모두 켜지면 직전 레벨 기준 낮은 입력과 연결 (min 의미). 테스트: 6bar+2bar→출력 2bar |
| 탠덤 센터 탱크 라인 pressurized 표시 | **FIXED** | 배기 터미널을 포함한 넷은 공급이 닿아도 언로딩(exhausted, 레벨 0)으로 분류. 테스트 포함. 펌프측 넷은 상태 모델 한계로 가압 유지 (ARCHITECTURE에 기록) |
| 감압밸브 역방향 cap | **FIXED** | cap을 정방향(P→A)에만 적용. 역방향 테스트 포함 |
| 유압 압력 스위치 초기 스냅숏 오류 | **FIXED** | 엔진 생성 시 유체→전기→유체 순 초기 솔브 |
| 타이머/카운터 출력 1틱 지연 | **FIXED** | 디바이스 출력 변경 시 전기 고정점 재실행 |
| P 디바이스 입력/출력 겹침 | **FIXED** | 출력 이미지를 출력 요소가 실제 기록한 디바이스로 제한. 테스트: 입력 P0이 출력으로 새지 않음 |
| 출력 코일 셀 통전 강조 안 됨 | **FIXED** | 통전된 출력 셀의 오른쪽 레일 노드를 켜서 모니터 강조 조건 충족. 테스트 포함 |
| vlink 마지막 행 무효 링크 | **FIXED** | 아랫줄 없는 행에서 vlink 생성 차단 + 안내 |
| T/C 경과·계수 미노출 | **FIXED** | `PlcMonitor.values`로 노출, 패널 디바이스 상태에 `T0=1.2 · C0=3` 형식 표시 |
| label/디바이스/실린더 오타 조용한 실패 | **FIXED** | `validateForSimulation()`에 교차 참조 경고 추가: 실린더 이름표, 디바이스 코일, 솔레노이드 대응 부품, ioMap 부품 미지정 |
| 3/2 솔레노이드 장비 뷰 5/2 오바인딩 | **FIXED** | 전용 3포트 스프라이트 신설 후 매핑 교체 |
| 압력계 바늘 100bar 포화 | **FIXED** | 풀스케일을 설정 가능 최대 300bar로 조정 (수치 텍스트가 1차 표시) |
| XG5000 비제휴 고지 부재 (WATCH) | **FIXED** | README "고지" 절: LS ELECTRIC 무관 독립 구현, `.xgp` 비호환, 로고 미사용 명시 |
| SW가 오리진 내 타 캐시 삭제 (WATCH) | **FIXED** | `hyd-` 접두사만 정리 |

## 미조치·후속 (사유 명시)

| 항목 | 분류 | 사유 |
|---|---|---|
| M6 브라우저 E2E·렌더링 프레임 테스트 | 후속 개발 | 테스트 러너 도입(Playwright/Storybook 등)이 필요한 인프라 작업. 현재는 세션 내 브라우저 수동 검증으로 보완 중 |
| WATCH: propertySchema-behavior 적합성 검사 | 후속 개발 | 등록 시 behavior가 참조하는 속성 키 존재 검증 — 다음 반복에서 레지스트리 등록기에 추가 예정 |
| WATCH: 엔진의 문서 참조 readonly화 | 후속 개발 | 코어 API 계약 강화 — 파괴적 변경이라 별도 반복에서 처리 |
| WATCH: 긴 연결망/순환망 성능 벤치마크 | 후속 개발 | 벤치 fixture 추가 예정 |
| 미터인·카운터밸런스 전용 예제, 3/2 롤러 중복 label 규칙 | 후속 개발 | ROADMAP 후순위 등재. 중복 실린더 label은 교차 참조 경고가 오타는 잡아주며, 중복 자체의 의미 규칙(첫 부품 선택)은 문서화된 현행 유지 |
| **IP 게이트 6~9 (provenance 확정, 법률 검토, side-by-side 독립 검토, LICENSE 선택, V-AMT EULA 확보, chain-of-title)** | **사용자 결정 필요** | 라이선스 선택·법률 자문·기여자 사실확인은 프로젝트 소유자의 판단·행위가 필요한 항목. 개발 측 준비물로 `ASSET_PROVENANCE.md` 원장 골격(사실 기재 + 소유자 확인 필드)을 작성해 둠. 런타임 의존성 고지 초안(React/React DOM/Zustand — 모두 MIT)도 원장에 포함 |

## 검증 스냅숏

- `npx tsc -b`: 오류 없음
- `npm test`: 14 files, **82 passed** (추가된 회귀: solver-fixes 8, plc-integration 4, plc-scanner 6, schema-validation 14)
- `npm run build`: 성공
- 브라우저 수동 확인: 아래 세션 기록 참조 (릴리프 20bar 제한 표시 등)

---

# 2차 대응 (codex-review-2.md, 2026-07-14)

2차 리뷰가 1차 대응의 판정 오류와 잔여 결함을 지적했다. 아래는 판정 정정과 조치 내역.
검증: `npm test` 113개 통과, `tsc` 클린, `npm run build` 성공.

## 판정 정정 (1차 표의 상태를 아래로 대체)

| 항목 | 1차 판정 | 2차 리뷰 지적 | 최종 조치 |
|---|---|---|---|
| H1 문서 검증 | FIXED | 구조만 검증하고 값·문법 미검증: `cells:[]` 렁 → 스캐너 TypeError, `vlinks:[null]` → TypeError, `strokeTime:"invalid"` → NaN 전파 | **FIXED(2차)** — propertySchema 기반 속성 검증(타입·유한성·min/max·select 목록, 누락은 기본값 채움), PLC 렁(행 수 1~32·행 폭·렁 id 유일·디바이스 문법 `[PMTCD]\d{1,5}`·preset 범위·출력 요소 마지막 열 강제), vlink(레코드·정수·범위·마지막 행 금지), ioMap(P 문법 + 방향↔부품 역할 적합성), 크기 상한(5MB/부품 2000/배선 4000/렁 200/경유점 128/ioMap 512, 문자열 200자). 회귀: `schema-hardening.test.ts` 18건 + "파싱 통과 문서는 엔진 첫 틱 무예외" 전 예제 왕복 |
| H4 유압 범위 | FIXED | 4/3 오픈 센터가 추가만 되고 의미 오류: 중립에서 P/A/B와 실린더 양측이 40bar 가압 표시 | **FIXED(2차)** — 배기 완화에서 supply 가드 제거로 "탱크로 열린 유로"를 일반 계산, 공급∧탱크개방 동시 도달 넷은 언로딩(배기·레벨 0)으로 분류. 오픈/탠덤 센터의 펌프 무부하와 실린더 자유 상태가 부품 분기 없이 표현됨. 골든 테스트: 중립 전 포트 배기·레벨 0, 솔레노이드 통전 시 P→A 가압 전진, 복귀 시 재언로딩 (`review2-engine.test.ts`) |
| H5 미저장 폐기 확인 | FIXED | `components.length` 기준이라 제목·PLC만 바꾼 변경은 확인 없이 폐기 | **FIXED(2차)** — 에디터 스토어에 `savedDocument` 기준점 + `isDirty()`(참조 비교) 도입. 저장(.json 다운로드/브라우저 저장)·불러오기·새 문서에서 기준점 갱신. `confirmDiscard()`가 isDirty 사용 |
| H6 릴리프 | FIXED | 기호가 P 레벨≥설정압을 UI에서 재추론 — 솔버 판정과 어긋날 수 있음 | **FIXED(2차)** — 솔버가 `reliefActive`(탱크 도달 ∧ 공급 ∧ 레벨≥설정압)를 계산해 스냅숏으로 전달, 기호는 그 값만 표시 |
| M1 SW 프리캐시 | FIXED | 개별 자산 실패를 무시해 반쪽 셸이 캐시될 수 있음 | **FIXED(2차)** — 원자적 설치: 모든 셸 자산 fetch 성공을 확인한 뒤에만 캐시 기록, 하나라도 실패하면 install 실패로 이전 SW/캐시 유지. 캐시 hyd-v3 |
| M5 틱 계약 문서화 | FIXED | 고정점 수렴 미보장(발진 회로에서 조용히 임의 상태) 미해결 | **FIXED(2차)** — 전기 고정점 반복 상한을 디바이스 수 비례로, 유체 동적 반복 상한을 동적 부품 수 비례로 확장. `snapshot.diagnostics.{electricConverged,fluidConverged}` 노출, 미수렴 시 상태바 경고. NC 자기 궤환 발진 테스트: 무예외 + `electricConverged=false` |
| M6 E2E/프레임 | DEFERRED | ROADMAP 후순위에 실제 미등재 | **FIXED(2차)** — ROADMAP 후순위 후보에 등재 (WATCH 항목들 포함) |
| M10 라우팅 | FIXED | 같은 방향만 수정 — 반대 방향이 등지고 배치되면 여전히 직선 관통 | **FIXED(2차)** — 등지는(facing-away) 반대 방향 판정 추가, 옆으로 우회. 4방향 테이블 테스트 추가 |
| L2 파일 취소 | FIXED | 포커스 폴백 1초 타이머가 큰 파일 `text()` 읽기와 경합해 취소로 오판 가능 | **FIXED(2차)** — change 도착 시 `chosen` 플래그, 폴백은 미선택일 때만 취소 처리. `text()` 실패도 오류로 완료 |

## 2차 신규 조치

| 항목 | 조치 |
|---|---|
| 전기 이름표 네임스페이스 혼용 (P0) | 디바이스 코일 집계를 `종류:이름표` 채널로 분리 — 솔레노이드 K1이 릴레이 K1 접점을 닫는 오염 차단. `validateForSimulation()`이 종류 간 이름표 공유를 경고. 테스트: 솔레노이드 K1 통전에도 릴레이 접점 K1 미닫힘 |
| 셔틀 양측 가압 (P1) | 볼이 한쪽에 앉는 의미 반영: 높은 압력 입력이 출력을 지배, 동률이면 inA. 입력 간 역급기 차단 유지 |
| 저장소 삭제 실패 무시 (P1) | `delete()`가 boolean 반환, 툴바가 실패 안내. `__proto__`/constructor/prototype 키는 저장 이름에서 배제(프로토타입 오염 방어), 내부 shape은 `Object.create(null)` |
| 실린더 이름표 중복 (L) | 검증 경고 추가 (첫 실린더만 참조됨을 안내) |
| XG5000 고지 (P2) | 앱 내 PLC 패널에도 비제휴·비호환 고지 표시 (README와 병행) |
| 부저 (P2) | 소리 미구현이므로 부품명을 "부저 (표시형 — 소리 없음)"로 정정 |
| 제3자 고지 (P0-문서) | `public/THIRD_PARTY_NOTICES.txt` 신설 — react/react-dom/scheduler/zustand 정확 버전 + MIT 전문. loose-envify·js-tokens는 번들 미포함을 빌드 산출물 검사로 확인 |
| 출처 원장 (P0-문서) | `ASSET_PROVENANCE.md`를 증거 수준 3단계([A] 저장소 검증 가능 / [B] 기여자 진술 필요 / [C] 법률·소유자 판단 대기)로 재구성. "모든 그래픽은 JSX" 부정확 기재(icon.svg 누락) 정정 |
| ARCHITECTURE 정정 | 모듈 트리를 실제 구조로 갱신(actuator.ts 등 부재 파일 제거, plc/ 경로·ui 구성 실화), PLC 디바이스 기재를 P/M/T/C로 정정(D는 후순위) |

## 2차 검증 스냅숏

- `npx tsc -b`: 오류 없음
- `npm test`: 17 files, **113 passed** (2차 추가: schema-hardening 18, review2-engine 5, step-controller 4, 라우팅 등지기 4)
- `npm run build`: 성공

---

# 3차 대응 (codex-review-3.md, 2026-07-14)

3차 리뷰의 P0 기능·교육 결함과 P1/P2를 처리했다. 검증: `npm test` 122개 통과, `tsc` 클린, `npm run build` 성공.
권리 게이트([C] 항목)는 소유자 결정 대기로 유지 — 아래 "사용자 결정 필요" 참조.

## P0 조치

| 리뷰 항목 | 조치 |
|---|---|
| 구분동작 조기 사이클 완료 (A+A−B+B−) | StepController에 참여 이력 상태기계 도입: 사이클 완료 = 모든 실린더 초기 복귀 ∧ **문서의 모든 실린더가 이번 사이클에서 초기 위치를 벗어난 적 있음**. 완료 시 참여 추적 리셋. 반례를 합성 스냅숏 단위 테스트로 고정: A− 경계에서 cycleComplete=false, B− 경계에서 true, 2사이클째 A만 왕복 시 false (`review3-engine.test.ts`) |
| 릴리프 활성 표시 오류 (exact-setpoint/언로딩/다중) | 활성 판정을 모든 cap·언로딩 이후 최종 상태로 이동: `tankOk ∧ ¬언로딩 ∧ 공급 도달 ∧ (cap 전 레벨 > 설정압) ∧ (최종 레벨 ≥ 설정압)`. 공급압=설정압(초과분 없음) → 비활성, 오픈센터 0 bar → 비활성, 40/50 bar 이중 릴리프 → 40만 활성. 테스트 4건 |
| D 디바이스 boolean 허용 | 스키마 문법을 `[PMTC]`로 축소(D는 word 디바이스 — 현재 범위에서 거부), PLC 패널 입력에서도 차단 + 안내. D word 설계는 ROADMAP 후순위로 명시 |
| 전기 디바이스 순서 의존 (bare label) | 디바이스 key를 `종류:이름표`로 통일(등록·코일 대입·카운터 리셋), 접점 조회는 이름표의 종류별 채널 OR(순서 무관 결정적), preset 충돌은 결정적으로 max + 실행 전 검증 경고. 같은 T1 두 타이머(1s/2s)를 순서 반전으로 돌려 동일 동작 확인하는 테스트 추가 |
| 4/3 밸브 센터링 스프링 부재 | `HydValve43` 양측에 센터링 스프링 글리프 추가 — `springCentered:true` 동작과 기호 일치 |
| 릴리프 기호의 비작동 유로 화살표 | base 기호를 정상(차단) 위치로 고정 — 화살표 기하는 상태와 무관하게 오프셋 위치 유지, 작동 표시는 색상 overlay(채움)만. 규범 기호와 시뮬레이션 표시 분리 원칙 |
| React 계열 MIT 고지 원문 불일치 | `THIRD_PARTY_NOTICES.txt`를 설치된 `node_modules/<pkg>/LICENSE` 원문을 무수정 복사해 재생성 (`Copyright (c) Facebook, Inc. and its affiliates.`) |
| 표준/완료 주장 과대 | README·PRD·ARCHITECTURE의 "ISO 1219 기호/표준 준수"를 "통용 관례를 참고한 교육용 독자 단순화, 적합성 미인증"으로 완화. README 고지에 준정량 bar·overlay 비규범 명시. 앱 툴바에 상시 교육용 고지 태그라인 추가 |

## P1 조치

| 항목 | 조치 |
|---|---|
| save("__proto__") 성공 모순 | 예약어 이름은 저장 자체를 거부(false) — 읽기 필터와 짝. 테스트 추가 |
| 파일 전체 읽기 후 크기 검사 | `File.size`를 `text()` 호출 전에 검사 |
| UTF-16 length 상한 | length는 하한 선별로만 쓰고 초과 가능 구간은 `TextEncoder` byte 수로 정확 판정 |
| warning이 step 안내 가림 | 상태바 우선순위 재정렬: 미수렴 경고 > 구분동작 일시정지 안내 > 일반 메시지 |
| 툴바 줄바꿈·음절 분리 | 버튼 `white-space: nowrap` + 툴바 `flex-wrap`/`word-break: keep-all` |
| 이전 문서 기록 잔존 | `clearSimHistory()` — 새 문서/열기/예제/브라우저 열기 시 레코더·StepController 폐기 |
| SETTLE_TICKS 관찰 횟수 의존 | 시뮬레이션 시간 기준(0.12s)으로 변경 |
| boundaries() 내부 배열 노출 | 복사본 반환 |
| FRL·파워유닛 명칭 불일치 | "공압 서비스 유닛 (단순화 — 여과·윤활·정압 미모사)", "유압 파워유닛 (펌프+탱크 — 릴리프는 별도 부품)"으로 정정 |

## P2·문서 조치

- ARCHITECTURE: 전기 고정점 상한 "디바이스 수 비례 + 진단", 유체 "동적 부품 수 비례", 릴레이 체인 **same-tick** 수렴으로 정정. 릴리프 활성의 최종 상태 판정 명시
- ROADMAP 후순위: 48종 표준 적합성 매트릭스(원문 확보 필요), Wire line function, base/overlay 분리 + 인쇄 중립 모드, p95 프레임 계측, D word 설계 등재
- ASSET_PROVENANCE: KS B 0054 현행(2024-12-27 확인)·ISO 1219 판본 구체화, KS C 0102 폐지(2013-12-31) 주의 기재

## 사용자 결정 필요 (개발 측에서 대신할 수 없음 — 리뷰 P0/RELEASE)

- 공개 GitHub Pages **자동 배포의 유지/중단**: 리뷰는 권리 게이트(LICENSE·기여자 진술·EULA 확인) 완료 전 자동 배포 중지를 권고. 배포 파이프라인 변경은 소유자 결정 사항으로 보류 — 결정 시 `deploy.yml`을 workflow_dispatch(수동 승인)로 전환 가능
- 프로젝트 LICENSE 선택, 기여자 사실확인서, side-by-side 검토, V-AMT/Automation Studio 계약 확인, AI chain of title (ASSET_PROVENANCE 4절)
- 표준 원문(KS B 0054, ISO 1219, IEC 60617) 확보 및 48종 대조 검토자 지정

## 3차 검증 스냅숏

- `npx tsc -b`: 오류 없음 / `npm test`: **122 passed** (3차 추가: review3-engine 8, storage 예약어 1) / `npm run build`: 성공
