# Visual Truth Layer

ProofRun의 기본 출력은 텍스트 보고서가 아니다. 기본 출력은 사람이 실행 결과를 보고 판단할 수 있는 **시각적 증거 화면**이며, 텍스트는 화면을 검색·접근성·자동화하기 위한 보조 표현이다.

## 제품 약속

> OpenClaw, DeepSeek Harness, Hermes, Cursor, CI, 또는 사내 도구가 전용 viewer를 갖고 있지 않아도, 실행 결과를 동일한 Evidence Bundle과 판단 화면으로 변환한다.

## Viewer-first 결과 계약

모든 adapter는 다음 bundle을 내보낸다.

```text
EvidenceBundle
├── decision-card        사람에게 먼저 보이는 결론
├── visual-artifacts     screenshot / HTML / graph / diff / video / trace
├── source-links         repo, commit, file, line, route
├── timeline              agent step → tool call → observation → gate
├── risk                  blast radius, confidence, stale status
├── forecast              next exception, gate ETA, review ETA, recovery ETA
├── human-action          approve / reject / request-change / rollback
└── machine-fallback      JSON + CLI text + exit code
```

텍스트만 반환되는 adapter는 `viewer_status: missing`으로 표시한다. 성공으로 간주하지 않는다.

## 공통 화면

### 1. Decision Card

첫 화면에서 다음 6가지만 보여준다.

- 지금 무엇이 바뀌었는가
- 실제로 확인된 것은 무엇인가
- 아직 확인하지 않은 것은 무엇인가
- 위험 반경은 어디까지인가
- 사람이 몇 분 안에 어떤 결정을 내려야 하는가
- 승인·반려·수정요청·롤백 중 무엇을 선택할 수 있는가

### 2. Evidence Canvas

화면은 source와 runtime을 양쪽에 고정한다.

```text
┌─ Source / Diff ───────┬─ Runtime / Visual ──────┐
│ file:line, commit     │ screenshot / app / web  │
│ changed symbols       │ console / network      │
│ blast radius          │ step timeline          │
├───────────────────────┴────────────────────────┤
│ Decision: APPROVE · REJECT · REQUEST CHANGE     │
│ Provenance · freshness · forecast · rollback    │
└──────────────────────────────────────────────────┘
```

### 3. Review Timeline

텍스트 로그를 그대로 노출하지 않고 이벤트를 카드로 묶는다.

`intent → plan → tool call → visual observation → exception → self-heal → gate → human decision → verification`

각 카드에는 시간, 모델/provider, 도구, 비용, 입력/출력 hash, source path를 둔다.

### 4. Stale / Unknown 표시

- `VERIFIED`: 현재 Git SHA와 evidence fingerprint가 일치
- `STALE`: 코드·환경·모델·도구 중 하나가 evidence 생성 후 변경됨
- `PARTIAL`: 일부 화면/로그만 확인
- `UNKNOWN`: adapter가 결과를 텍스트로만 반환하거나 provenance가 없음
- `BLOCKED`: 회복 한계를 넘었거나 인간 결정 대기

초록색 PASS는 `VERIFIED`일 때만 사용한다. `PARTIAL`, `UNKNOWN`, `STALE`을 PASS처럼 보이게 만들지 않는다.

## viewer 없는 도구를 지원하는 방식

### Adapter 입력

```json
{
  "tool": "openclaw.exec",
  "runId": "run_01",
  "stdout": "...",
  "stderr": "...",
  "exitCode": 0,
  "artifacts": [
    {"kind": "screenshot", "path": "...", "mime": "image/png"},
    {"kind": "html", "path": "...", "mime": "text/html"}
  ],
  "fingerprint": {
    "model": "...",
    "provider": "...",
    "repoSha": "...",
    "runtime": "..."
  }
}
```

### Adapter 출력

1. 로컬에서는 `proofrun view <bundle>`이 ephemeral local viewer를 연다.
2. CI에서는 정적 `index.html`과 artifact directory를 만든다.
3. OpenClaw에는 카드 요약, 로컬 viewer 경로, 이미지 artifact, machine JSON을 함께 반환한다.
4. viewer가 불가능한 환경에서는 CLI가 동일한 상태·판정·증거 링크를 출력한다.

OpenClaw 자체를 필수 런타임으로 만들지 않는다. OpenClaw adapter는 여러 adapter 중 하나이며, 핵심 viewer와 evidence schema는 독립적으로 설치·실행된다.

## 시각 검증 우선순위

1. **웹**: Playwright screenshot + console/network + route + source map
2. **모바일**: simulator screenshot + accessibility tree + test step + device fingerprint
3. **CLI/서버**: terminal transcript + structured event + generated HTML/graph
4. **CI**: static report + PR artifact + stale check + exit status
5. **문서/리서치**: source citation graph + claim/evidence matrix

## 인간 개입 시간 예측

화면에는 단일 숫자를 확정값처럼 표시하지 않는다.

```text
review ETA: 30–90 sec
basis: 12 historical reviews, median/p90
uncertainty: medium
missing: no prior evidence for this device/provider
```

관측 history가 없으면 `prior only`라고 표시한다. 모델 자기평가 confidence만으로 시간을 계산하지 않는다.

## 첫 구현 순서

1. 기존 baseline HTML을 `EvidenceBundle`을 읽는 viewer shell로 교체
2. source graph·diff·decision card·freshness badge를 한 화면에 배치
3. 단일 route에서 Playwright screenshot을 연결
4. OpenClaw/dsh/Hermes를 동일 adapter contract로 입력
5. approve/reject/request-change 이벤트와 rollback link 연결
6. GitHub Actions artifact와 PR comment는 마지막에 추가

## 성공 조건

사람이 텍스트 로그를 읽지 않고도 30초 안에 다음을 판단할 수 있어야 한다.

- 변경이 의도와 맞는가
- 실제 화면/실행 결과가 정상인가
- 재검증이 필요한 stale 증거인가
- 지금 승인할 것인가, 수정시킬 것인가, 롤백할 것인가

이 조건을 만족하지 못하면 기능이 더 많아져도 Viewer-first 제품으로는 완료로 표시하지 않는다.
