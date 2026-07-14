# HYD 최종 후속 코드·기능·표준·법률 리뷰

- 검토일: 2026-07-14
- 검토 대상: `be53271` (`4537066..be53271`, 32 files, +1,899/-154)
- 선행 문서: `codex-review.md`, `codex-review-2.md`, `codex-review-response.md`, `ASSET_PROVENANCE.md`
- 검토 범위: 신규 구분동작, 릴리프 밸브 수정, 공압·유압·전기 48종과 PLC, 문서/저장, KS·ISO·IEC 기준, 교육현장 적용, 저작권·라이선스·상표·경쟁제품 위험
- 종합 판정: **REQUEST CHANGES / 공개 배포 BLOCK**

> 이 문서는 코드·저장소·공개된 공식 자료를 이용한 기술 및 위험관리 검토다. 법률 자문, KS/ISO/IEC 인증 또는 적합성 인증서가 아니다. 표준의 세부 기하와 등록 심벌을 조항별로 확정하려면 합법적으로 확보한 현행 원문을 자격 있는 검토자가 직접 대조해야 한다.

## 1. 최종 결론

이번 수정은 실질적인 개선이다. 전체 테스트 113개, TypeScript 빌드, 프로덕션 빌드는 모두 통과했고, 4/3 오픈센터, 셔틀 역급기, 문서 스키마 경계, 라우팅, dirty 상태, 솔버 진단, 릴리프의 압력 상한, 구분동작의 대표 A+A− 경로가 개선됐다. 실제 Chromium에서도 구분동작 자동 정지, 다음 동작, 빈 캔버스 진행, 사이클 표시, 정지 후 초기화가 동작했다.

그러나 현재 상태를 “최종 완료”, “KS/ISO 표준 기호”, “교육현장 배포 준비 완료”로 승인할 수는 없다.

1. **구분동작은 유효한 다실린더 순서에서 사이클 완료를 너무 일찍 선언한다.** `A+ A− B+ B−`는 A− 직후 B가 한 번도 움직이지 않았는데도 모든 실린더가 초기 위치라는 이유로 사이클 완료가 된다.
2. **릴리프 밸브의 압력 제한은 개선됐지만 표시 상태가 여전히 거짓일 수 있다.** 정확히 설정압과 같은 경우와 오픈센터로 0 bar 언로딩된 경우에 `reliefActive=true`가 확인됐다.
3. **PLC의 D 디바이스를 boolean으로 허용한다.** PRD와 ARCHITECTURE가 word semantics 때문에 D를 범위 밖으로 명시했는데 스키마가 `[PMTCD]`를 허용한다. 교육적으로 잘못된 개념을 가르칠 수 있다.
4. **전기 장치 이름표 분리는 완성되지 않았다.** 코일 집계 일부만 `종류:이름표`를 사용하고, 디바이스 생성과 접점 조회는 여전히 bare label이라 직렬화 순서에 따라 결과가 달라질 수 있다.
5. **유압 4/3 밸브는 동작 모델상 스프링 센터 복귀인데 기호에 센터링 스프링이 없다.** 릴리프·FRL·파워유닛도 명칭/동작/기호 간 불일치가 남는다.
6. **현재 저장소 증거로 KS/ISO 적합성을 주장할 수 없다.** `ASSET_PROVENANCE.md:26-29`가 ISO/KS 원문을 열람·대조하지 않았다고 명시하고, 현행 국내 유공압 기준인 KS B 0054와의 항목별 대조표도 없다.
7. **공개 배포 권리 게이트가 열려 있다.** 프로젝트 LICENSE, 기여자 진술, AI 체인 오브 타이틀, 경쟁제품 EULA, 표준 심벌 이용 범위, 공개 Pages 책임 승인이 미완료다. React 계열 MIT 고지도 설치된 원문과 다르다.

따라서 적용 범위별 판정은 다음과 같다.

| 적용 범위 | 판정 | 조건 |
|---|---|---|
| 개발자 내부 기능 검증 | 조건부 통과 | 아래 P0 기능 결함을 알고 제한적으로 사용 |
| 교사 로컬 평가·수업 설계 | 조건부 가능 | “논리 기반 단순화/표준 적합 미인증” 표시, 잘못된 부품은 수업에서 제외 |
| 학생 대상 제한 LMS/교실 사용 | 보류 권고 | 사이클·D 디바이스·기호 오류 수정, 접근통제와 권리 확인 필요 |
| 공개 GitHub Pages | **BLOCK** | 권리·고지·표준 주장·기능 P0 해소 전 자동 배포 중지 권고 |
| 공개 소스/오픈소스 배포 | **BLOCK** | 프로젝트 LICENSE와 자산별 재배포 권리 확정 필요 |
| 유료 학원·SaaS·상업 판매 | **BLOCK** | 한국 법률 자문, 상표·계약·표준 라이선스 및 해외 계약 관할 검토 필요 |

## 2. 검증 방법과 증거

### 2.1 새로 실행한 검증

| 검증 | 결과 |
|---|---|
| `npm test -- --run` | **17 files, 113/113 통과** |
| `npx tsc -b` | 통과 |
| `npm run build` | 통과, 69 modules transformed |
| 전체 변경 정적 리뷰 | `4537066..be53271` 32개 파일 검토 |
| Chromium 실제 UI | 대표 A+A− 구분동작 통과, 콘솔 warning/error 0 |
| 1440×719 시각 검증 | 일시정지 시 툴바 줄바꿈·한글 음절 분리 재현 |
| 독립 반례 프로브 | 아래 세 결함 재현 후 임시 테스트 삭제 |

반례 프로브에서 확인한 결과:

- `A+ A− B+ B−`: A는 전진·후진했지만 B는 움직이지 않았고, A− 직후 `cycleComplete=true`.
- 공급압=릴리프 설정압 40 bar: 압력 제한 동작은 없지만 `reliefActive=true`.
- 오픈센터 언로딩 라인: 릴리프 P 포트는 `exhausted`, 표시 압력 0 bar인데 `reliefActive=true`.

이 세 반례는 기존 113개 테스트에는 포함되지 않는다. 즉 테스트 전부 통과가 제품 의미의 전부 통과를 뜻하지 않는다.

### 2.2 판정 기준

| 판정 | 의미 |
|---|---|
| PASS | 대표 동작과 현재 테스트 계약이 일치하며 새 반례가 확인되지 않음 |
| CONDITIONAL | 기본 동작은 되지만 이름표, 예외 입력, 표시, 규격 또는 교육상 제한이 있음 |
| FAIL | 부품명·설명·교육적 의미와 다른 결과가 재현됨 |
| BLOCK | 공개 배포나 교육 적용 전에 반드시 해결해야 할 항목 |

### 2.3 검토 한계

- ISO/IEC 웹 페이지와 e나라표준인증의 현행 상태·적용범위, 공개 저작권 정책은 확인했다.
- 유료·구독 표준의 전체 등록 심벌과 치수표를 이 저장소에 복제하거나 AI 입력으로 재배포하지 않았다.
- 따라서 아래 “구체적 불일치”는 코드의 기능 선언과 실제 SVG/동작 사이에서 확정 가능한 것만 단정한다. 나머지는 “적합성 미입증”으로 판정한다.
- 경쟁제품의 설치본, 비공개 매뉴얼, 구매계약, 실제 수락 EULA는 제공되지 않았으므로 계약 적용 여부는 확정하지 않는다.

## 3. `codex-review-response.md` 재검증

| 응답 주장 | 최종 판정 | 근거 |
|---|---|---|
| H1 셔틀 역급기 해결 | PASS | 높은 입력 선택과 비선택측 격리 회귀시험 통과. 동압 tie 정책은 문서화 필요 |
| H2 PLC→전기 연동 | CONDITIONAL | 대표 relay/timer/counter 연동은 통과하나 bare-label 디바이스 등록/접점 조회가 남음 |
| H3 PLC CTU/CTD | PASS | 상승 edge, preset, reset 대표 경로 통과 |
| H4 4/3 오픈센터 | 기능 PASS | 중립 P/A/B/T 언로딩 의미 개선. 다만 reliefActive가 최종 언로딩 전 상태를 사용 |
| H5 dirty 보호 | PASS | 문서 변경 추적 개선 확인 |
| H6 릴리프 | **FAIL/부분 수정** | 압력 cap과 runtime 전달은 개선. 정확한 설정압·언로딩·다중 릴리프의 최종 상태가 틀릴 수 있음 |
| M5 고정점 진단/상한 | CONDITIONAL | 동적 반복 상한과 진단은 추가. ARCHITECTURE가 여전히 ≤5/≤4, relay next-tick으로 기술하고 장연쇄 시험 없음 |
| M7 이름표 namespace | **FAIL/부분 수정** | 코일 집계만 일부 typed key. `engine.ts:68-85`, `369-372`는 bare label |
| M9 JSON 방어 | CONDITIONAL | 구조 검증은 크게 개선. 5 MB를 UTF-16 길이로, 전체 `file.text()` 후 검사 |
| M10 저장소 prototype 방어 | **FAIL/부분 수정** | 읽기에서 예약어를 걸러도 `save("__proto__")`는 true를 반환하고 저장 성공 UI를 표시 |
| M11 PLC device 문법 | **FAIL** | D를 bit처럼 허용하여 PRD/ARCHITECTURE의 범위 제외 결정과 충돌 |
| Phase 11 구분동작 완료 | **FAIL/부분 완료** | 대표 A+A− UI는 통과. 다실린더 조기 사이클, 상태 메시지 가림, UI 줄바꿈, UI 회귀시험 부재 |
| 제3자 고지 완료 | **FAIL** | React 계열 copyright line이 설치된 LICENSE 원문과 다름 |
| 표준/독자 창작 증빙 개선 | **미완료** | 원장은 좋아졌지만 핵심 항목이 미서명 `[B]` 및 미확인 체크박스로 남음 |

## 4. 최우선 기능·아키텍처 발견 사항

### [P0/BLOCK] 구분동작의 사이클 완료 조건이 참여 이력을 보지 않는다

`src/core/sim/step-controller.ts:117-121`은 경계 시점에 모든 실린더가 초기 위치인지 만 확인한다. 각 실린더가 이번 사이클에서 실제로 움직였는지, 기대 순서의 마지막 동작이 끝났는지는 기록하지 않는다.

이 때문에 `A+ A− B+ B−`에서 B가 아직 한 번도 움직이지 않았어도 A− 직후 모든 실린더가 초기 위치이므로 사이클 완료가 된다. 상태바와 변위단계선도에 잘못된 `↻` 경계가 표시된다.

개선 요구:

1. 사이클 정의를 명시한다. 최소한 “관찰 대상 실린더가 모두 초기 위치를 벗어난 적이 있고 다시 초기 위치로 복귀”를 추적해야 한다.
2. 단순 참여 집합만으로 충분한지, 예제/교사가 정의한 시퀀스 종점이 필요한지 결정한다.
3. `A+A−B+B−`, `A+B−A−B+`, 일부 실린더 미동작, 중간 정지 후 복귀, 초기 위치가 1인 실린더를 회귀시험에 넣는다.
4. `cycleComplete`를 현재 위치의 파생값이 아니라 명시적 상태기계 이벤트로 만든다.

### [P0/HIGH] 릴리프 밸브 활성 상태가 최종 유체 상태와 불일치한다

`src/core/sim/fluid-solver.ts:299-310`에서 `reliefActive`는 `level >= setpoint`로 계산하지만 실제 cap은 `level > setpoint`일 때만 수행한다. 또한 `reliefActive`는 `src/core/sim/fluid-solver.ts:312-331`의 최종 언로딩 판정 전에 계산된다.

확인된 오류:

- 설정압과 정확히 같은 압력: 열림 표시지만 실제로 제한한 압력은 없음.
- 오픈센터/탠덤 언로딩: 최종 P가 0 bar·`exhausted`인데 열림 표시.
- 같은 영역에 설정압이 다른 릴리프가 여러 개면 먼저 계산된 상위 설정 밸브가 최종 cap 후에도 활성로 남을 수 있음.

`HydRelief`가 솔버의 boolean만 사용하도록 바꾼 방향은 옳다. 문제는 boolean의 계산 시점과 의미다. 모든 cap과 언로딩을 끝낸 최종 압력·유로를 기준으로 실제 방출 유량이 존재하는 밸브만 활성화해야 한다. 이 논리/상태 기반 제품에서는 최소한 `finalPressure > setpoint`로 방출이 발생했는지 별도 기록해야 한다.

### [P0/EDU] D 디바이스를 boolean PLC 장치로 허용한다

- `docs/PRD.md:53-56`, `docs/ARCHITECTURE.md:135-140`: D는 word semantics 때문에 MVP 제외.
- `src/core/model/schema.ts:165-169`: `[PMTCD][0-9]{1,5}`를 허용.
- `src/core/plc/scanner.ts`: 모든 디바이스를 boolean으로 저장·연산.

이는 단순 구현 누락이 아니라 교육 개념 오류다. XG5000에서 D 계열 데이터 레지스터를 bit 접점처럼 가르칠 수 있다. 현재 범위에서는 D를 스키마와 UI에서 거부하고, word 기능을 별도 설계할 때 타입·명령·표시를 추가해야 한다.

### [P0/HIGH] 전기 디바이스가 문서 순서에 따라 달라진다

`src/core/sim/engine.ts:68-85`는 첫 bare label이 디바이스 kind/mode/preset을 결정하고 뒤의 같은 label을 건너뛴다. 코일 집계는 일부 `kind:label`을 사용하지만 접점은 `src/core/sim/engine.ts:369-372`에서 다시 bare label을 조회한다.

영향:

- `R1`, `T1`, `C1`, `Y1`이 같은 텍스트를 공유할 때 완전 독립 namespace가 아니다.
- 같은 `T1`인 on-delay/off-delay 또는 preset이 다른 두 타이머는 components 배열에서 먼저 나온 정의가 승리한다.
- 부품 재배치/저장 순서 변경이 회로 동작을 바꿀 수 있다.

디바이스 key, 코일/접점 참조, PLC ioMap, validation을 모두 하나의 typed identity로 통일하고 중복 mode/preset을 오류로 거부해야 한다.

### [P0/RELEASE] 공개 배포가 열린 권리 게이트보다 앞서 있다

`README.md:5`는 공개 Pages를 안내하고 `.github/workflows/deploy.yml:4-46`은 main push마다 배포한다. 반면 `ASSET_PROVENANCE.md:47-52`에는 프로젝트 LICENSE, 참여자 사실확인, side-by-side 검토, V-AMT/Automation Studio 계약, AI chain of title, Pages 소유자 승인이 미완료로 남아 있다.

이는 저작권 침해가 확인됐다는 뜻은 아니다. 저장소가 공개 배포 권한을 아직 입증하지 못했다는 뜻이다. 권리 승인 전 자동 배포를 유지하는 것은 프로젝트의 자체 통제와 모순된다.

### [P1] 저장 성공·문서 크기 방어가 사용자에게 잘못된 확신을 준다

1. `src/core/storage/index.ts:52-53`은 읽을 때 `__proto__`, `constructor`, `prototype`을 버리지만 `save()`는 이를 허용하고 true를 반환한다. 툴바는 저장 성공과 saved 상태를 표시하지만 다시 목록/로드할 수 없다.
2. `src/app/file.ts:85-87`은 전체 파일을 `file.text()`로 할당한 뒤 검사한다.
3. `src/core/model/schema.ts:22-30`은 byte가 아니라 JavaScript UTF-16 code unit 수를 `MAX_JSON_BYTES`와 비교한다. 실제 UTF-8 5 MB를 넘는 다국어 문서가 통과할 수 있다.

예약어는 저장 전에 거부하고, 업로드는 `File.size`를 읽기 전에 검사하며, 다른 호출자는 `TextEncoder` byte 수를 사용해야 한다.

### [P1] 구분동작 UI 상태와 수명주기 문제

- `StatusBar.tsx:25-40`은 editor warning이 있으면 step pause/cycle 메시지를 표시하지 않는다.
- 1440×719에서 “다음 동작” 추가 후 툴바가 약 118px로 늘고 “동작”이 음절 단위로 분리됐다. 버튼 `white-space: nowrap`과 그룹별 overflow/반응형 정책이 없다.
- `simStore.stop()`은 module-global recorder/StepController를 보존한다. 중지 후 새 문서를 열면 이전 문서의 변위/경계가 새 문서 패널에 남을 수 있다.
- `SETTLE_TICKS=6`은 시간(ms)이 아니라 관찰 횟수라 observation cadence가 바뀌면 “중간 정지” 시간이 달라진다.
- `boundaries()`가 내부 mutable array를 그대로 노출하고 `observe()` 결과와 마지막 배열 원소를 조합하는 side channel을 사용한다.

## 5. 부품 48종 재검증

아래 “기능”은 현재 논리/상태 기반 제품 범위의 판정이다. 실제 유량, 압력손실, 누설, 관성, 충격, 열, 기계 안전을 재현한다는 뜻이 아니다. “기호”는 정식 적합 인증이 아니라 코드의 명칭·동작과 SVG가 서로 일치하는지를 우선 본 것이다.

### 5.1 공압 20종

| 부품 | 기능 판정 | 최종 검토 |
|---|---|---|
| `pneu.source` 공압원 | PASS | 설정 압력 공급. 실제 컴프레서 특성은 범위 밖 |
| `pneu.service-unit` FRL | **CONDITIONAL** | P→A 전달은 정상. 기호는 단일 generic box에 가까워 Filter-Regulator-Lubricator 세 기능을 교육용으로 식별하기 어렵고 레귤레이션 동작도 없음 |
| `pneu.silencer` | PASS | 배기 terminal로 동작 |
| `pneu.tee` | PASS | 3포트 분기 정상 |
| `pneu.valve.3-2-manual` | PASS | 조작 공급/해제 배기 |
| `pneu.valve.3-2-roller` | CONDITIONAL | 끝단 전환은 정상. 같은 cylinder label 중복 시 첫 부품 의존 |
| `pneu.valve.5-2-manual` | PASS | 복동 실린더 왕복 정상 |
| `pneu.valve.5-2-double-pilot` | CONDITIONAL | 양측 전환·무신호 메모리 정상. 양 파일럿 동시 입력 우선순위/경고 명시 필요 |
| `pneu.valve.5-2-single-pilot` | PASS | 파일럿 전환·스프링 복귀 |
| `pneu.valve.3-2-solenoid` | CONDITIONAL | 고유 Y label에서 정상. typed device identity 결함 영향 |
| `pneu.valve.5-2-solenoid` | CONDITIONAL | ON 전진/OFF 복귀. label 충돌 영향 |
| `pneu.valve.5-2-double-solenoid` | CONDITIONAL | 좌·우 전환과 메모리 정상. 양측 동시 ON 정책/경고 필요 |
| `pneu.valve.5-3-double-solenoid` | CONDITIONAL | 무신호 중앙복귀·hold 정상. label 충돌과 동시 ON 처리 명시 필요 |
| `pneu.cylinder.double` | PASS | 양실 상태에 따른 전·후진·정지 |
| `pneu.cylinder.single` | PASS | 가압 전진·배기 시 스프링 복귀 |
| `pneu.speed-controller` | PASS | 체크 방향과 개도 계수 감속 |
| `pneu.shuttle` | PASS/문서 필요 | 이전 저압측 역급기 수정 확인. 동압 tie와 전환 hysteresis는 교육 설명 필요 |
| `pneu.two-pressure` | PASS | 양 입력 필요, 낮은 압력 수준 선택 |
| `pneu.quick-exhaust` | PASS | 공급 해제 시 A→R 직접 배기 |
| `pneu.pressure-switch` | PASS | 임계 압력 접점과 전기 연동 |

### 5.2 유압 16종

| 부품 | 기능 판정 | 최종 검토 |
|---|---|---|
| `hyd.power-unit` | **CONDITIONAL/명칭 오류** | P 공급과 T 탱크는 정상. 이름은 “펌프+탱크+릴리프”이나 behavior와 기호에는 내장 릴리프가 없음 |
| `hyd.tank` | PASS | 귀환 terminal |
| `hyd.tee` | PASS | 3방향 분기 |
| `hyd.gauge` | PASS | 최종 supply level 표시. 준정량 값임을 UI에 표시할 필요 |
| `hyd.relief` | **FAIL** | 초과압 cap은 동작. 정확한 설정압·언로딩·다중 밸브에서 active 표시 오류. 비작동 기호에도 유로 화살표가 남아 정상 차단을 오해시킬 수 있음 |
| `hyd.valve.4-2-lever` | PASS | 두 위치 연결과 스프링 복귀 기호 일치 |
| `hyd.valve.4-3-closed-solenoid` | **CONDITIONAL/기호 FAIL** | 중립 전 포트 차단·실린더 hold 정상. `springCentered:true`인데 SVG에 센터링 스프링 없음 |
| `hyd.valve.4-3-tandem-solenoid` | **CONDITIONAL/기호 FAIL** | 중립 P→T, A/B 차단 정상. 센터링 스프링 누락 |
| `hyd.valve.4-3-open-solenoid` | **CONDITIONAL/기호 FAIL** | 중립 네 포트 언로딩 정상. 센터링 스프링 누락, reliefActive 계산과 충돌 |
| `hyd.reducing` | PASS | 정방향 pressure cap과 역방향 처리 대표 시험 통과 |
| `hyd.pressure-switch` | PASS | 초기 snapshot부터 임계 접점 연동 |
| `hyd.check` | PASS | A→B 허용, 역류 차단 |
| `hyd.pilot-check` | PASS | X 가압 시 역류 허용 |
| `hyd.flow-control` | PASS | 체크 내장 방향과 반대 방향 개도 감속 |
| `hyd.cylinder.double` | PASS | 전·후진·차단 위치 유지 |
| `hyd.motor` | PASS | A/B 압력 방향에 따른 정·역회전 |

릴리프 기호 수정은 P→T 방향을 바로잡고 runtime 상태를 받은 점에서 개선됐다. 그러나 `src/ui/symbols/index.tsx:710-713`은 닫힌 상태에서도 화살표를 옆으로 옮겨 계속 그린다. 학생에게 “정상 차단”과 “압력 초과 시 개방”을 명확히 가르치려면 표준에 맞는 정상 위치 기호를 고정해서 보여주고, 시뮬레이션 활성은 별도 색상/overlay로만 표현하는 편이 안전하다.

### 5.3 전기 12종

| 부품 | 기능 판정 | 최종 검토 |
|---|---|---|
| `elec.supply-24v` | PASS | 양전원 도달성 시작점 |
| `elec.supply-0v` | PASS | 귀환 전원 도달성 시작점 |
| `elec.pushbutton` | PASS | NO/NC, 순간/유지 입력 |
| `elec.limit-switch` | CONDITIONAL | 실린더 끝단 연동. 중복 cylinder label 시 첫 부품 의존 |
| `elec.relay-contact` | CONDITIONAL | 정상 label 추종. bare-label device 조회 문제 |
| `elec.relay-coil` | CONDITIONAL | same-tick 연동 통과. 종류 간 namespace 완전 분리 아님 |
| `elec.timer` | **CONDITIONAL** | on/off delay 대표 동작. 같은 T label의 mode/preset이 첫 컴포넌트 순서에 좌우됨 |
| `elec.counter` | CONDITIONAL | edge 계수/preset 통과. 중복 label과 snapshot 가시성 부족 |
| `elec.counter-reset` | CONDITIONAL | 대상 reset 정상. typed identity 통일 필요 |
| `elec.solenoid` | CONDITIONAL | 밸브 연동 정상. relay/timer/counter와 label 충돌 가능 |
| `elec.lamp` | PASS | 완전 회로와 PLC 출력 점등 |
| `elec.buzzer` | PASS(표시형) | 논리 energized·시각 표시 정상. 명칭대로 실제 소리는 없음 |

전기 12종은 기능적 교육 관례로는 사용할 수 있지만 IEC 60617 또는 현행 KS의 개별 그래픽 심벌 적합성이 검증된 것은 아니다. “KS 기호”보다 “국내 시퀀스 교육용 단순화 표기”로 표시하고, 정식 심벌 검토가 끝난 부품만 별도 배지를 주는 편이 타당하다.

### 5.4 PLC 명령·연동

| 항목 | 판정 | 결과 |
|---|---|---|
| NO/LOAD, NC/LOADB | PASS | bit 접점 논리 정상 |
| OUT | PASS | 출력 이미지와 부하 매핑 |
| SET/RST | PASS | 유지/해제 경로 |
| TON/TOFF | PASS/제약 | 대표 지연 동작. 동일 T label 중복 mode/preset은 오류 |
| CTU/CTD | PASS/제약 | edge 계수·preset·reset. 동일 C label 중복 정책 필요 |
| PLC→relay/contact/lamp | PASS/제약 | 대표 same-tick 연쇄 통과, typed identity 미완성 |
| PLC→solenoid→cylinder | PASS | 내장 예제 대표 경로 통과 |
| P/M/T/C bit 장치 | PASS/문서 필요 | XG5000 스타일 단순화 범위를 명시해야 함 |
| D 장치 | **FAIL** | word device를 boolean으로 허용. 현재 범위에서는 거부해야 함 |
| ioMap 의미 검증 | CONDITIONAL | ID 존재뿐 아니라 direction↔부품 역할·device kind 적합성을 검증해야 함 |

## 6. 구분동작 기능 최종 리뷰

### 확인된 정상 경로

- `auto-reciprocate` 예제를 구분동작으로 실행.
- 시작 밸브 조작 후 첫 행정 완료에서 자동 일시정지.
- 350 ms 대기 중 simulation time이 증가하지 않음.
- “다음 동작”으로 A− 진행, 상태바에 사이클 완료 표시.
- 빈 SVG 캔버스 클릭으로 다음 단계 진행.
- 변위단계선도에 단계 번호와 `↻` 마커 표시.
- 정지 후 구분동작 컨트롤 초기화.
- 브라우저 콘솔 warning/error 0.

### 미완료 항목

1. 다실린더 참여 이력 없는 조기 cycleComplete.
2. warning이 step 상태 메시지를 가리는 우선순위.
3. 1440×719 툴바 줄바꿈과 한글 음절 분리.
4. 새 문서/로드 시 이전 recorder·boundary 잔존 가능성.
5. 실제 UI timer/pause/resume/blank-click을 검증하는 영구 E2E 테스트 없음.
6. “중간 정지”가 120 ms가 아니라 6 observations로 정의되어 tick 변경에 취약.

완료 기준은 단일 A+A− 예제를 넘어 최소 다음으로 확장해야 한다.

- 1실린더: A+A−, A−A+, 중간 정지, 무동작.
- 2실린더: A+B+A−B−, A+A−B+B−, 일부 실린더 미동작.
- UI: warning 병존, 다음 버튼, 빈 캔버스, 정지/새 문서/로드, 작은 화면.
- 데이터: 단계선도와 상태바가 동일 event object를 사용하고 사이클 이벤트가 한 번만 발생.

## 7. KS·ISO·IEC 규격 검토

### 7.1 적용해야 할 현행 기준의 구분

1. **국내 유공압 기호**: [KS B 0054 - 유압·공기압 도면 기호](https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSB0054&menuId=919&reformNo=10&tmprKsNo=KSB0054&topMenuId=502&upperMenuId=503)는 2024-12-27 최종 확인된 현행 KS이며, 유압·공기압 기기/장치의 기능을 표시하는 도면 기호를 규정한다. 현재 e나라 기본정보에는 ISO와의 부합화 수준 데이터가 없다. 따라서 “KS B 0054 = ISO 1219 완전 동일”이라고 가정하면 안 된다.
2. **국제 유공압 기호와 회로도**: [ISO 1219-1:2012](https://www.iso.org/standard/60184.html)는 그래픽 심벌과 작성 규칙, [Amendment 1:2016](https://www.iso.org/standard/66287.html)은 그 개정, [ISO 1219-2:2012](https://www.iso.org/standard/51200.html)는 회로도 작성의 주 규칙, [ISO 1219-3:2016](https://www.iso.org/standard/62614.html)은 symbol modules/connected symbols를 다룬다.
3. **전기 그래픽 심벌**: 현재 국제 원천은 [IEC 60617 Database](https://webstore.iec.ch/en/publication/2723)다. 과거 국내 `KS C 0102`는 [2013-12-31 폐지](https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSC0102&menuId=503&reformNo=09&tmprKsNo=KSC0102&topMenuId=502)됐다. 폐지된 KS C 0102를 현행 근거로 사용하면 안 된다.
4. **전기 문서 작성과 식별**: 국내 문서 규칙은 `KS X IEC 61082-1`(2021-09-24), 단자·도체 식별은 `KS C IEC 60445`(2022-10-11) 등을 목적에 맞게 별도 검토해야 한다. 그래픽 심벌, 문서 작성, 도체 식별은 서로 다른 적합성 항목이다.
5. **PLC 언어**: 국제 기준은 [IEC 61131-3:2025 Edition 4](https://webstore.iec.ch/en/publication/68533)다. HYD는 XG5000 스타일의 제한된 교육 구현이므로, 명령 이름이 유사하다는 이유만으로 IEC/KS 61131-3 적합성을 주장해서는 안 된다.

### 7.2 현재 저장소에서 확정 가능한 어긋남

#### A. “ISO/KS 기반” 주장의 증거 모순

- `docs/PRD.md:5,73`, `README.md:16`, `docs/ARCHITECTURE.md:45`는 표준/ISO 1219 기반 표현을 사용한다.
- `ASSET_PROVENANCE.md:26-29`는 해당 표준을 실제로 열람·복제하지 않고 기억 기반으로 작도했으며 정식 대조가 남았다고 한다.

이는 곧바로 기호가 전부 틀렸다는 뜻은 아니지만, 적합성 주장을 뒷받침할 근거가 없다는 뜻이다. 현 단계 문구는 “ISO 1219/KS B 0054에서 통용되는 개념을 참고한 교육용 독자 단순화, 적합성 미인증” 수준으로 낮춰야 한다.

#### B. 4/3 밸브의 복귀 방식 누락

`src/core/library/hydraulic/index.ts:128-207`의 세 4/3 밸브는 모두 `springCentered:true`다. 그러나 `src/ui/symbols/index.tsx:776-829`의 `HydValve43`은 양쪽 솔레노이드만 그리고 센터링 스프링을 그리지 않는다.

이는 표준 조항을 인용하지 않더라도 기능 선언과 회로 기호가 직접 모순된다. 학생은 전원 제거 시 중립으로 돌아가는 원인을 기호에서 읽을 수 없다. **교육현장 적용 전 수정 필수**다.

#### C. 릴리프 밸브의 정상 차단 표현과 조정 가능성

`src/ui/symbols/index.tsx:704-719`은 비활성 시에도 P→T `FlowArrow`를 옆으로 옮겨 남겨 둔다. 정상 차단과 개방 유로를 정적 기호에서 분명히 분리하지 못한다. 설정압을 property로 조정할 수 있지만 기호의 spring은 조정 가능 여부를 명확히 표현하지 않는다.

정확한 선형·화살표·spring 기하는 KS B 0054와 ISO 1219-1 정식 원문으로 대조해야 한다. 그 전에도 최소한 정적 base symbol은 정상 상태를 고정해서 나타내고, 활성 상태는 비규범적 색상 overlay로 분리해야 한다.

#### D. FRL과 파워유닛의 명칭·기호·기능 불일치

- `pneu.service-unit`: 이름은 FRL이지만 기호와 동작이 세 기능을 분리해 보여주지 않는다.
- `hyd.power-unit`: 이름은 “펌프+탱크+릴리프”지만 behavior와 SVG에는 내장 릴리프가 없다.

교육용 단순화가 허용되더라도 이름은 실제 구현과 같아야 한다. “공압 공급/서비스 유닛(여과·윤활·정압 미모사)” 및 “유압 펌프+탱크”처럼 정정하거나 실제 요소를 구현해야 한다.

#### E. 배관/신호선 의미 모델 부재

`src/core/model/types.ts:28-35`의 Wire는 pneumatic/hydraulic/electric kind와 endpoint/waypoint만 가진다. `WireView.tsx:33-65`는 모든 회로선을 기본 solid polyline으로 그린다.

이 구조로는 작동관, 파일럿/제어관, 드레인관, 전기 연결선 등 선의 기능을 문서 데이터에서 보존·검증할 수 없다. ISO 1219-2나 KS B 0054 회로도 수준의 적합성 검증을 하려면 `lineFunction` 같은 의미 필드와 해당 선종, legend, validation이 필요하다.

#### F. 시뮬레이션 애니메이션과 규범 기호가 혼합됨

밸브 몸체가 런타임 위치에 따라 움직이고, 가압선 굵기·색, 부품 fill이 바뀐다. 학습용 애니메이션으로 유용하지만 규범 회로 기호 자체와 혼동될 수 있다.

권장 구조:

1. 항상 고정된 “표준 검토 대상 base symbol”.
2. 별도 레이어의 색상·강조·움직임 overlay.
3. 화면 legend에 “색상/애니메이션은 HYD 시뮬레이션 표시이며 KS/ISO 기호 일부가 아님”.
4. 인쇄/PDF/평가 모드에서는 overlay를 끈 정적 중립 회로도 제공.

### 7.3 표준 적합성 완료 조건

48종 각각에 다음 필드를 가진 매트릭스를 만들어야 한다.

| 필드 | 내용 |
|---|---|
| 부품 type/name | 앱 식별자와 학생 표시명 |
| 기능 계약 | 정상 상태, 조작 방식, 복귀, 포트 연결, 예외 입력 |
| KS 기준 | KS B 0054 또는 관련 현행 KS의 정확한 항목 |
| ISO/IEC 기준 | 적용되는 표준/등록 심벌 번호와 판본 |
| 차이 유형 | 동일, 허용 변형, 교육 overlay, 의도적 단순화, 불일치 |
| SVG 증거 | symbol component와 snapshot hash |
| 검토자/날짜 | 자격 있는 사람의 서명 또는 승인 기록 |
| 라이선스 | 표준 심벌을 소프트웨어·웹에 구현/배포할 권한 근거 |

완료 전에는 README/PRD에 “표준 준수”, “ISO 1219 기호”를 완료 사실처럼 쓰지 않는 것이 맞다.

## 8. 교육현장 적용 검토

### 8.1 가장 큰 위험은 안전보다 ‘정확한 오개념’이다

HYD는 수치 유량/전류 해석을 하지 않는 논리 시뮬레이터다. 그 자체는 좋은 범위 결정이지만, 시각적 확신이 강하기 때문에 잘못된 상태를 더 설득력 있게 가르칠 수 있다.

현재 교육상 P0:

- 움직이지 않은 B까지 끝난 것으로 보이는 조기 사이클 완료.
- 0 bar 언로딩 상태에서 릴리프가 작동 표시.
- D word device를 boolean 접점으로 허용.
- 스프링 센터 밸브에 스프링이 없어 복귀 원리를 숨김.
- “펌프+탱크+릴리프”라고 쓰고 릴리프가 실제로 없음.

### 8.2 수업용 표시 원칙

1. 앱 상단과 인쇄물에 “교육용 논리/상태 시뮬레이션 - 실제 설비 선정·압력 설정·안전 검증에 사용 금지”를 표시한다.
2. 부품마다 `정상 상태`, `작동 조건`, `복귀 방식`, `단순화`, `관련 표준 검토 상태`를 학생이 볼 수 있게 한다.
3. bar 값은 물리 해석 결과가 아니라 공급 레벨과 cap을 위한 준정량 값임을 명시한다.
4. 비정상/동시 입력, 미배선, label 충돌, D device는 warning이 아니라 실행 차단 error로 분류할 항목을 정한다.
5. 교사 모드에서 정답 회로뿐 아니라 “왜 이 기호/연결이 틀렸는가”를 보여 주는 진단을 제공한다.
6. 시험 대비 예제는 실제 기출을 복제하지 않은 “독자 작성 연습 예제”로 표시하고 작성 근거·작성자를 기록한다.

### 8.3 학교 도입 전 최소 수용시험

- 48종 부품 각각 정상/비정상/경계 3종 이상의 contract test.
- 대표 공압·유압·전기·PLC 회로의 교사 검수 서명.
- 중립/무전원/무압 상태에서 모든 기호와 출력이 예상 상태인지 screenshot baseline.
- 작은 노트북 화면(1366×768), 125% 확대, 키보드만 사용, 색각 이상 대비 검증.
- 저장/불러오기/새 문서/오프라인/손상 JSON 복구 시험.
- 수업 종료 후 학생 문서가 외부로 자동 전송되지 않는지 개인정보/보안 확인.
- 제품 버전, 표준 검토 판본, 예제 판본을 수업자료에 고정.

## 9. 법률·저작권·라이선스 최종 검토

### 9.1 결론의 범위

저장소에서 V-AMT 또는 Automation Studio의 소스, 로고, 스크린샷, 독점 파일 포맷, 외부 binary image/font pack을 직접 복제한 증거는 찾지 못했다. 기능 영역이 유사하다는 사실만으로 저작권 침해가 되는 것은 아니다. WIPO도 저작권은 아이디어·절차·작동 방법 자체가 아니라 구체적 표현을 보호한다고 설명한다([WIPO](https://www.wipo.int/en/web/copyright/protection)).

그러나 “직접 복제 증거 없음”은 “독립 창작과 배포 권리 입증”이 아니다. 최초 커밋이 66파일·13,181행의 대량 결과이고, 그 이전의 프롬프트·초안·참고자료 접근 기록이 없으며, provenance 핵심 진술이 미서명 `[B]`다.

### 9.2 학교 수업 예외는 공개 웹 배포 면허가 아니다

[현행 저작권법 제25조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032158805)는 일정한 학교·교육기관이 수업 목적으로 공표된 저작물의 일부분을 복제·배포·공연·전시·공중송신할 수 있게 하고, 불가피한 경우 전부 이용과 공중송신 시 보호조치 등을 규정한다.

이 조항은 다음을 자동 허용하지 않는다.

- 일반 대중에게 열린 GitHub Pages와 공개 저장소.
- 교육기관이 아닌 개인 개발자의 상시 공개 제품 배포.
- 경쟁제품 EULA나 비밀유지 의무 위반.
- 유료 표준 전체/등록 심벌 데이터베이스의 재배포.
- 실제 기출문제·교재·매뉴얼의 광범위한 복제.

[저작권법 제35조의5](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025203559)의 공정이용도 목적·성격, 저작물 종류·용도, 이용 비중·중요성, 시장 영향 등을 종합 판단한다. “교육용/무료”라는 한 문장으로 자동 면책되지 않는다.

따라서 학교 내부 제한 사용과 공개 웹서비스를 별도 권리 시나리오로 관리해야 한다.

### 9.3 V-AMT와 Automation Studio

- [V-AMT 공식 소개](https://www.cubictek.co.kr/sub/sub02_01.php?cat_no=2&idx=3&mode=view&offset=)는 공압·유압·전기·PLC 가상 실습, 2D 회로 작도, XG5000/PLC 연동, 자격 예제를 설명한다.
- Automation Studio Educational Edition도 유공압·전기·PLC 회로 작도·시뮬레이션·훈련 기능을 제공한다.
- [Automation Studio EUSLMA](https://www.famictech.com/Portals/0/PDF/F7510105-EN%20Automation%20Studio%20EUSLMA%20V18.pdf)는 적용되는 계약과 라이선스 범위에 따라 복제, 수정, 역공학, 파생물 등에 제한을 둔다.

현재 미확인 사실:

1. 누가 어느 제품/판본을 설치·사용했는지.
2. 어떤 구매계약과 EULA 판본에 동의했는지.
3. 매뉴얼·카탈로그·프로젝트 파일·스크린샷·심벌 라이브러리를 봤는지.
4. 제품 사용 중 만든 회로/자산을 HYD에 옮겼는지.
5. 초기 커밋 전 Claude 입력에 경쟁제품 자료가 포함됐는지.

기여자별 서명 진술과 실제 계약을 확보하기 전 “법적으로 완전한 clean-room”이라고 쓰면 안 된다. side-by-side 검토는 기능적 필연 요소와 선택 가능한 표현(UI 배치, 색, 아이콘, 문구, 예제 구성)을 분리해야 한다.

### 9.4 ISO·IEC·KS 자료의 저작권

[ISO 저작권 정책](https://www.iso.org/copyright.html)과 [ISO 라이선스 조건](https://www.iso.org/terms-conditions-licence-agreement.html)은 표준 출판물과 콘텐츠의 저작권·이용 제한을 명시한다. [IEC 60617 DB 안내](https://library.iec.ch/grasymb/grasymb.nsf/welcome?OpenPage)는 심벌 개념의 인용과 식별을 장려하지만 데이터베이스의 상당 부분 추출·공유에는 제한이 있음을 알린다.

실무 원칙:

- 표준 번호와 검토 결과를 사실적으로 인용하는 것과 표준 PDF/표/심벌 데이터베이스를 복제하는 것을 구분한다.
- 정식 원문을 구매/접근했다고 해서 웹앱에 심벌을 재배포할 권리가 자동으로 생긴다고 가정하지 않는다.
- 표준 원문, 캡처, 등록 심벌 대량 데이터를 public repo나 AI 프롬프트 기록에 넣지 않는다.
- 독립적으로 작성한 기본 도형이라도 정확한 등록 심벌 복제에 해당하는지, 구현·배포 허가가 필요한지 ISO/IEC/KSA/KATS 조건을 확인한다.
- ISO 로고, 인증·승인 표현을 사용하지 않는다. 표준 번호 언급과 인증 주장은 다르다.

### 9.5 오픈소스 고지와 프로젝트 LICENSE

`public/THIRD_PARTY_NOTICES.txt:17,43,69`은 React, react-dom, scheduler의 copyright를 `Meta Platforms, Inc.`로 기록했다. 설치된 각 package LICENSE는 `Copyright (c) Facebook, Inc. and its affiliates.`다. MIT 조건은 copyright와 permission notice 포함을 요구하므로 설치된 원문을 그대로 보존해야 한다. [React 18.3.1 LICENSE](https://github.com/facebook/react/blob/v18.3.1/LICENSE)

또한 저장소에 프로젝트 자체 LICENSE가 없다. 이 상태에서 소스가 공개되어 있어도 제3자에게 복제·수정·재배포 권한을 명확히 허용한 오픈소스 프로젝트라고 볼 수 없다.

필수 조치:

1. lockfile 기준으로 notices를 자동 생성/검증하고 원문을 변경하지 않는다.
2. SBOM과 배포 bundle의 dependency/license manifest를 CI 산출물로 남긴다.
3. 독점/공개 라이선스 정책을 먼저 결정한다.
4. 기여자 권리 귀속과 자산 재배포 권리를 확인한 후 프로젝트 LICENSE를 추가한다.

### 9.6 AI 생성물과 chain of title

`ASSET_PROVENANCE.md`의 “Claude Code로 작성”은 출처 설명의 시작일 뿐 권리 증명 전체가 아니다. AI 서비스 약관의 output 권리 조항이 있더라도 제3자 권리 비침해, 인간 저작자성, 입력자료 사용 권한을 자동 보증하지 않는다.

자산/파일별로 최소 다음을 기록해야 한다.

- 경로와 hash.
- 생성/수정 날짜와 기여자.
- 사용한 모델·계정 유형·당시 약관 버전.
- 입력한 외부 자료와 사용 권한, 또는 외부 자료 없음에 대한 서명 진술.
- 인간이 선택·수정·배열한 창작 기여.
- 경쟁제품·표준·교재·시험자료 접근 여부.
- 최종 소유권/재라이선스 승인자.

### 9.7 상표와 제품명

XG5000은 LS ELECTRIC 제품 식별자로 오인될 수 있다. README와 PLC 패널의 비제휴·비호환 고지, 로고 미사용, `.xgp` 비호환 정책은 좋은 통제다. 이를 유지하되 제품명은 호환성/교육 스타일을 설명하는 필요한 범위에서만 사실적으로 사용하고, 공식·인증·제휴를 암시하지 않아야 한다.

V-AMT와 Automation Studio도 비교 설명 외에는 제품명·로고·화면을 마케팅 자산처럼 사용하지 않는 것이 안전하다.

## 10. 문서·품질의 추가 불일치

1. `README.md:29,39`는 Phase 0–10/82 tests로 남아 있고 ROADMAP/실제 결과는 Phase 11/113 tests다.
2. `docs/ARCHITECTURE.md:101,105`는 전기 ≤5, 유체 ≤4 반복이라고 하나 구현은 device/dynamic component 수에 비례한다.
3. `docs/ARCHITECTURE.md:117`은 relay chain이 다음 tick에 이어진다고 쓰지만 현재 fixed-point 계약은 same-tick이다.
4. README의 “수치 해석 없음”과 ROADMAP의 bar 준정량 pressure propagation 경계를 더 명확히 써야 한다.
5. 성능 60fps 완료 주장은 engine tick 평균만으로 입증되지 않았다. React/SVG, 동적 유체/전기 chain, p95 frame time의 브라우저 측정이 필요하다.
6. 구분동작 UI와 릴리프 SVG runtime 상태에 영구 E2E/snapshot 테스트가 없다.

## 11. 권장 수정 우선순위

### P0 - 공개·학교 배포 전에 필수

1. StepController에 실린더 참여/사이클 상태기계를 추가하고 다실린더 반례를 회귀시험으로 고정한다.
2. 릴리프 활성 판정을 모든 cap·언로딩 이후의 최종 상태로 계산하고 equality/open-center/multiple-relief 시험을 추가한다.
3. D 디바이스를 거부하거나 진짜 word semantics를 구현한다. 현재 scope에서는 거부가 적절하다.
4. 전기 DeviceId를 kind+label로 완전 통일하고 중복 timer mode/preset을 schema/validation error로 만든다.
5. 4/3 밸브 센터링 스프링을 기호에 반영하고 릴리프 정상 차단 기호를 재검토한다.
6. React 계열 MIT 고지를 설치된 LICENSE 원문 그대로 복구한다.
7. 공개 Pages 자동 배포를 권리 승인 게이트와 연결하고, 승인 전 “표준 준수/완료” 주장을 낮춘다.
8. 프로젝트 LICENSE, 기여자 진술, AI/자산 chain of title, 경쟁제품 EULA 사실관계를 확정한다.

### P1 - 교육 정확성과 안정화

1. KS B 0054/ISO 1219 기반 48종 적합성 매트릭스를 작성하고 검토자 승인을 남긴다.
2. Wire에 line function을 추가해 작동·파일럿·드레인·전기선을 구분한다.
3. FRL과 파워유닛의 명칭/기호/동작을 일치시킨다.
4. 표준 base symbol과 시뮬레이션 overlay를 분리하고 인쇄 중립 모드를 만든다.
5. reserved save name, byte-accurate pre-read limit, metadata/배열 수 상한을 수정한다.
6. step status 우선순위, 작은 화면 toolbar, recorder/document 수명주기를 수정한다.
7. UI E2E와 SVG snapshot, accessibility/zoom 테스트를 CI에 추가한다.

### P2 - 문서·운영

1. README/ARCHITECTURE/ROADMAP의 phase, test 수, fixed-point, same-tick, 준정량 pressure 설명을 동기화한다.
2. SBOM/notices/license CI와 배포 승인 checklist를 만든다.
3. 예제별 독자 작성 provenance와 교사 검수 기록을 남긴다.
4. 지원 브라우저/화면 크기, 수업용 버전 고정, 변경 이력과 회귀시험 결과를 릴리스 노트에 포함한다.

## 12. 최종 승인 체크리스트

다음 항목이 모두 충족되기 전에는 공개 배포 또는 학교 표준 교재 채택을 승인하지 않는다.

- [ ] `A+A−B+B−`가 B 동작 전 사이클 완료로 표시되지 않는다.
- [ ] 릴리프 exact-setpoint, open-center 0 bar, 다중 설정압 시험이 통과한다.
- [ ] D 디바이스가 bit로 실행되지 않는다.
- [ ] relay/timer/counter/solenoid 동일 label이 순서와 무관하게 독립 동작하거나 명시적으로 거부된다.
- [ ] 세 유압 4/3 밸브의 센터 복귀 방식이 기능과 기호에서 일치한다.
- [ ] 48종 부품의 기능/기호/단순화/표준 대조표가 승인됐다.
- [ ] KS B 0054, ISO 1219, IEC 60617/61082, IEC 61131-3의 적용 범위를 혼동하지 않는다.
- [ ] 정적 규범 기호와 HYD 색상/애니메이션 overlay가 구분된다.
- [ ] React 계열 MIT 고지가 원문과 일치하고 SBOM/license CI가 통과한다.
- [ ] 프로젝트 LICENSE와 모든 코드·자산·예제의 배포 권리가 확정됐다.
- [ ] V-AMT/Automation Studio 접근·계약·EULA 및 독립 창작 진술이 검토됐다.
- [ ] 공개 Pages 배포 책임자가 위 위험을 서면 승인했다.
- [ ] 학교용 안전/단순화 고지, 접근통제, 교사 검수, 화면 접근성 시험이 완료됐다.

## 13. 최종 판정

**코드 기반은 이전보다 크게 좋아졌고, 113개 자동 시험과 대표 구분동작 UI는 통과했다. 그러나 릴리프 표시, 다실린더 사이클, D 디바이스, 전기 identity, 기호 의미, 공개 배포 권리에서 확인 가능한 결함이 남아 있다.**

따라서 이번 최종 후속 리뷰의 결론은 다음과 같다.

- 기능 개발 브랜치: **REQUEST CHANGES**
- 교사 내부 평가: **조건부 가능**
- 학생 수업 배포: **보류 권고**
- KS/ISO/IEC 적합 주장: **미입증/사용 금지**
- 공개 GitHub Pages·오픈소스·상업 배포: **BLOCK**

이 판정은 침해 확정이 아니라, 교육 정확성과 공개 배포 권한을 입증하기 위한 필수 통제가 아직 닫히지 않았다는 의미다.
