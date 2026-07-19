# 아키텍처

## 1. 기술 스택

| 영역 | 선택 | 근거 |
|---|---|---|
| 프레임워크 | React 18+ + TypeScript + Vite | 표준적, 빠른 반복, 정적 배포 |
| 회로 렌더링 | SVG (React 컴포넌트로 기호 정의) | 스키매틱은 벡터가 자연스러움. DOM 이벤트로 포트 클릭·호버 처리 용이, 확대해도 선명 |
| 장비 뷰 렌더링 | SVG (일러스트도 벡터로 제작) | 회로도와 동일 파이프라인, 상태 바인딩 재사용 |
| 상태 관리 | zustand (에디터 상태) + 시뮬레이션 엔진은 React 외부의 순수 TS | 엔진을 React 렌더 주기와 분리해야 틱 안정성과 테스트 용이성 확보 |
| 테스트 | vitest — 엔진(솔버)은 유닛 테스트 필수 | 시뮬레이션 정확성이 제품의 신뢰성 그 자체 |
| 배포 | 정적 호스팅 (GitHub Pages / Netlify 등) | 서버 없음 |

백엔드 없음. 단, 문서 모델과 저장 포맷은 향후 서버 저장을 붙일 수 있도록 직렬화 가능한 순수 데이터로 유지한다.

## 2. 모듈 구조

```
src/
  core/                  # React 무관, 순수 TypeScript
    model/
      types.ts           # CircuitDocument, ComponentInstance, Wire, Point 등
      operations.ts      # 부품 추가/이동/삭제, 배선, 장비 배치 등 불변 갱신
      schema.ts          # JSON 직렬화·파싱·경계 검증·버전 마이그레이션
    library/             # 부품 정의 (데이터 주도)
      types.ts           # ComponentDefinition, Behavior, PropertyField
      pneumatic/ hydraulic/ electric/ automation/   # 도메인별 부품 정의 (automation: MPS 스테이션, Phase 14)
      registry.ts        # 타입 ID → ComponentDefinition 레지스트리
    sim/
      engine.ts          # 고정 틱 루프, 밸브 전환·실린더/모터 적분, 디바이스 상태
      electric-solver.ts # 24V/0V 레일 간 연결성 해석
      fluid-solver.ts    # 압력 상태 전파 (공압/유압 공용)
      step-controller.ts # 구분동작 실행 — 동작 경계·사이클 완료 감지 (Phase 11)
      recorder.ts        # 변위단계선도용 실린더 위치 기록
      validate.ts        # 실행 전 검증 (경고)
      mps-station.ts     # MPS 스테이션 물리 상태기계 + 채널 상수 (Phase 14)
      types.ts           # SimulationSnapshot, ComponentRuntime
    plc/
      model.ts           # LadderRung, LadderCell(a/b/음변환(N) 접점·코일·TON/TOFF/CTU/CTD), vlink
                         #   특수릴레이 _T1S/_T2S(1초/2초 클록)는 스캐너 내장·접점 전용, 다채널 ioMap channel
      scanner.ts         # 노드 도달성 기반 스캔 실행기 + 모니터
    examples/index.ts    # 내장 예제 빌더
    storage/index.ts     # 브라우저(localStorage) 문서 저장소 어댑터
    routing.ts geometry.ts
  ui/
    editor/              # 스키매틱 에디터 (캔버스, 팔레트, 속성 패널, 툴바, 상태바)
    symbols/             # 교육용 단순화 기호 SVG (ISO 1219/KS 관례 참고, 적합성 미인증)
    equipment/           # 일러스트 장비 뷰 (스프라이트 + 자유 배치)
    plc/PlcPanel.tsx     # 교육용 래더(LD) 에디터 + 모니터링 (XG5000 표기 관례 참고)
    diagram/             # 변위단계선도 패널
    sim/simStore.ts      # 실행 루프(연속/구분 모드), 스냅숏 구독
    i18n/                # ko/en 문자열
  app/                   # 레이아웃(App.tsx), 파일 저장/불러오기(file.ts)
```

**원칙: `core/`는 React를 import하지 않는다.** 엔진과 모델은 Node에서 단독 테스트 가능해야 한다.

## 3. 데이터 모델

### 문서 (저장 단위 = .json 파일 하나)

```ts
interface CircuitDocument {
  schemaVersion: number;             // 현재 v4
  // learningActivity: 학습 활동 설명 (Phase 12) — 저장 시 자동 초안/수정 가능
  meta: { title: string; description?: string; createdAt: string; learningActivity?: string };
  components: ComponentInstance[];   // 모든 도메인의 부품이 한 문서에 공존
  wires: Wire[];                     // 포트-포트 연결 (kind가 같아야 유효)
  plcProgram?: LadderProgram;        // 렁 목록 + 디바이스 사용 정보
  ioMap?: IoEntry[];                 // P 디바이스 ↔ 부품 매핑 (+channel: 다채널 부품용, v4/Phase 14)
  equipmentLayout?: Record<string, Point>; // 장비 뷰 자유 배치 좌표 (Phase 8 / v2)
}
// 저장 경로(파일·브라우저)는 parseDocument로 열고 prepareDocumentForPersistence로 저장한다.
// 후자가 학습 활동 자동 채움·trim·길이 상한을 담당하는 단일 경계이며,
// parseDocument는 허용된 meta 키만 재구성해 미등록 개인정보 키를 제거한다.

interface ComponentInstance {
  id: string;
  type: string;                      // registry 키, 예: "pneu.valve.5-2-solenoid-spring"
  position: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  properties: Record<string, unknown>;  // 정의의 속성 스키마를 따름
}
```

### 부품 정의 (라이브러리, 코드가 아닌 데이터 중심)

```ts
interface ComponentDefinition {
  type: string;
  domain: "pneumatic" | "hydraulic" | "electric" | "automation";
  ports: PortDefinition[];           // 위치, kind, 라벨(P/A/B/R 등)
  propertySchema: PropertyField[];   // 속성 패널 자동 생성용
  behavior: BehaviorSpec;            // 솔버가 해석하는 동작 명세 (아래 4절)
  symbolId: string;                  // ui/symbols의 SVG 기호
  equipmentSpriteId?: string;        // 장비 뷰 일러스트
}
```

새 부품 추가 = 정의 객체 + 기호 SVG 추가로 끝나야 한다. 솔버에 부품별 분기를 넣지 않는다.
예외: `automation` 도메인의 자동화설비 스테이션(Phase 14)은 다채널 I/O를 갖는 복합
장비라 엔진·PLC·UI에 MPS 전용 분기가 있다. 이 특례를 정의 메타데이터(`ioChannels`) +
복합설비 adapter로 일반화하는 리팩터링은 ROADMAP 후순위 후보에 등재되어 있다
(codex-review-phase-14 P1-6).

## 4. 시뮬레이션 엔진

### 4.1 실행 모델

- **고정 틱** (기본 20ms = 50Hz). `requestAnimationFrame`과 분리된 누적 시간 방식(탭 백그라운드 대비).
- 틱 계약 (구현 기준):
  1. **전기 고정점 해석** — 접점 상태 확정 → 연결성 솔브 → 부하 통전(회로 통전 ∨ PLC 강제 통전) → 릴레이 출력 갱신을 안정될 때까지 반복. 반복 상한은 디바이스 수에 비례(max(5, 디바이스+3))해 릴레이 체인이 한 틱에 수렴하며, 상한 도달 시 `diagnostics.electricConverged=false`로 보고한다. 코일 집계는 "종류:이름표" 채널별 OR(솔레노이드는 별도 채널).
  2. **타이머/카운터 갱신** — dt 기반 경과/에지 전이. 출력이 바뀌면 전기 고정점을 재실행해 접점이 같은 틱에 반영된다.
  3. **PLC 스캔** — ioMap 입력(접점 상태) → 래더 스캔 → 출력을 `plcForced`에 기록. 출력이 바뀌면 전기 고정점 + 디바이스 전이를 재실행해 PLC→릴레이/타이머/카운터→접점 연쇄가 같은 틱에 닫힌다.
  4. **밸브 전환** — 수동/롤러/솔레노이드(이번 틱 전기 결과)/파일럿(직전 틱 유체 결과).
  5. **유체 솔브** — 동적 연결(셔틀·2압·급속배기·파일럿체크)은 고정점까지 반복(상한 = max(4, 동적 부품 수+2), 미수렴 시 `diagnostics.fluidConverged=false`). 릴리프 밸브는 탱크 경로가 살아 있을 때 유로 영역의 압력 레벨에 설정압 상한을 적용하고, 활성 표시는 모든 cap·언로딩 이후 최종 상태로 판정한다.
  6. **실린더/모터 적분** — 위치·회전각 갱신. 리밋 스위치·롤러는 다음 틱의 접점/밸브 판정에 반영된다.
  - 엔진 생성 시에는 유체→전기→유체 순으로 초기 솔브를 수행해 압력 스위치 접점이 올바른 초기값을 가진다.
- 엔진 출력은 `SimulationState`(부품별 상태 스냅숏). UI는 이것을 구독해 기호/장비 뷰에 반영만 한다.

### 4.2 전기 솔버 — 연결성 해석

전압·전류 계산 없이 그래프 도달성으로 판정한다:

1. 도선과 닫힌 접점으로 노드 그래프 구성 (열린 접점은 간선 제거)
2. 24V 레일에서 도달 가능한 노드 집합, 0V 레일에서 도달 가능한 노드 집합 계산
3. 부하(코일·램프·솔레노이드)의 양단이 각각 두 집합에 속하면 **통전**
4. 통전된 코일 → 해당 릴레이의 접점 상태 갱신 → 바뀌었으면 재해석을 수렴까지 반복 — 릴레이 체인은 **같은 틱 안에서** 안정된다 (타이머/카운터의 시간·에지 전이만 tick 단위)

타이머/카운터는 통전 상태를 입력으로 받아 자체 경과시간/카운트를 틱마다 갱신하는 상태 기계.

### 4.3 유체 솔버 — 압력 상태 전파 (공압/유압 공용)

- 포트 상태: `PRESSURIZED | EXHAUSTED | BLOCKED` (유압은 EXHAUSTED 대신 탱크 귀환).
- 밸브는 현재 스풀 위치에 따른 **포트 간 내부 연결표**를 제공 (예: 5/2 밸브 위치1 = P→A, B→R2).
- 압력원에서 BFS로 가압 상태 전파, 배기구에서 배기 상태 전파. 양쪽 다 닿지 않는 포트는 BLOCKED(갇힘).
- 파일럿 포트가 가압되면 밸브 전환 신호로 처리 (솔레노이드와 동일한 전환 입력 채널).
- 셔틀/2압/체크 밸브는 연결표가 입력 상태에 의존하는 특수 규칙으로 정의.

### 4.4 액추에이터

- 실린더: 헤드측/로드측 포트 압력 상태 조합 → 이동 방향 결정. 위치는 0..1 정규화, 기본 속도 × 속도제어밸브 계수로 틱마다 적분.
- 위치가 부착된 리밋 스위치 설정점을 교차하면 전기 도메인에 접점 이벤트 발행.
- 단동 실린더는 스프링 복귀를 배기 시 역방향 이동으로 모델링.

### 4.5 PLC 스캔

- 래더는 렁 목록, 렁은 셀 그리드(접점/수직·수평 연결선/코일/기능블록).
- 스캔: ioMap을 통해 전기 도메인에서 입력 이미지 채움 → 렁을 위에서 아래로, 각 렁은 좌→우 통전 평가 → 출력 이미지를 ioMap으로 전기 도메인에 반영.
- 디바이스 메모리: `P/M/T/C` 비트 맵 (D 워드 디바이스는 후순위 — PRD 4.4). T/C는 전기 타이머와 동일한 상태 기계 재사용.
- 모니터링: 스캔 결과의 셀별 통전 정보를 래더 UI에 오버레이.

### 4.6 장비 뷰 동기화

장비 뷰는 별도 상태를 갖지 않는다. `SimulationState`의 같은 부품 상태를 기호 대신 일러스트로 렌더하는 **또 하나의 뷰**일 뿐이다. 회로도와 장비 뷰는 스플릿 화면으로 병행 표시하고, 부품 선택을 상호 하이라이트한다.

## 5. 에디터 설계 요점

- **그리드 스냅** (기본 10px). 포트는 그리드 위에 정렬.
- **배선**: 포트 클릭 → 직교(맨해튼) 라우팅으로 미리보기 → 반대 포트 클릭으로 확정. kind가 다른 포트끼리는 연결 거부 + 시각 피드백.
- **편집/시뮬레이션 모드 분리**: 시뮬레이션 중에는 구조 편집 잠금, 조작 가능 부품만 인터랙션.
- **실행 취소**: 문서 모델에 대한 커맨드 패턴 또는 불변 스냅숏 undo 스택.
- **속성 패널**: `propertySchema`에서 자동 생성.

## 6. 테스트 전략

- `core/sim`: 도메인별 골든 시나리오 유닛 테스트 — 예: "양측 솔레노이드 5/2 + 복동 실린더 + 리밋 스위치 A+A- 왕복", "온딜레이 타이머 3초 후 램프 점등", "PLC 자기유지 회로".
- 자격증 대표 시퀀스(A+B+A-B- 등)를 엔진 레벨 통합 테스트로 상시 회귀 검증.
- UI는 에디터 핵심 동작(배선, 스냅, 저장/불러오기 왕복)만 컴포넌트 테스트.
