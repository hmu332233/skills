---
name: herdr-agent
description: "Spawn a coding agent (claude / codex / any) into a new herdr location — a new tab, a pane split, or a new workspace — then wait until it is ready (agent_status idle). Use when running inside herdr (HERDR_ENV=1) and the user asks to open/launch/spawn an agent: \"claude 띄워줘\", \"codex 하나 더\", \"옆에 split해서 claude\", \"새 워크스페이스에 codex\"."
---

# herdr-agent — herdr에 agent 띄우기

herdr 안에서 새 위치에 coding agent(claude / codex / 그 외)를 띄우고 **준비될 때까지 확인**하는 스킬. 저수준 herdr 제어는 `herdr-cli` 스킬이 담당하고, 이 스킬은 그 위에 "agent 스폰" 워크플로를 얹는다.

**핵심은 단순하다: 위치 잡고 → agent 켜고 → idle 될 때까지 기다리고 → 보고.** auto mode·rc 같은 추가 설정은 메인 흐름이 아니라 [부록](#부록--추가-설정-방법)에 있다 (사용자가 명시할 때만).

## 메인 흐름

### 0. 가드

`HERDR_ENV != 1`이면 **즉시 중단**하고 "herdr 안이 아니라 agent를 못 띄운다"고 알린다.

```bash
[ "$HERDR_ENV" = "1" ] || { echo "not inside herdr — stop"; exit 1; }   # echo만으론 안 멈춤 — 반드시 중단
herdr pane get "$HERDR_PANE_ID"   # 내 pane/tab/workspace/cwd 확보
```

자기 위치는 항상 `$HERDR_PANE_ID`로 판정한다. `focused:true`는 사용자 UI가 보는 pane이지 내 pane이 아니다.

> id는 `w1K`, `w1K:t6`, `w1K:pA` 형태(영숫자 가능). 항상 `pane get`/`list`/`split` 응답에서 다시 읽는다 (compact될 수 있음).

### 1. 의도 파싱

자연어에서 뽑는다. 명시 안 하면 기본값.

| 항목 | 값 | 기본값 |
|------|-----|--------|
| 타겟 | 새 탭 / pane split / 새 워크스페이스 | 새 탭 |
| agent | claude / codex / 그 외 | claude |
| 개수 | N개 | 1 |
| split 방향 | right / down | right |
| cwd (새 워크스페이스) | 경로 | 아래 규칙 |

예: "claude 하나 더" → 새 탭에 claude / "옆에 split해서 codex" → split right에 codex / "새 워크스페이스에 claude 2개" → workspace ×2.

**새 워크스페이스 cwd**: 경로 명시하면 그대로. 안 주면 현재 cwd 기본, 단 "새 워크스페이스"는 보통 다른 프로젝트라 **모호하면 한 줄 되물음**.

> auto mode·rc는 메인 흐름에 없다. 사용자가 "auto로", "리모트로"처럼 명시하면 [부록](#부록--추가-설정-방법) 참고.

### 2. 타겟 생성

타겟별로 pane을 만들고 **응답 json에서 새 pane id(`NEW_PANE`)를 파싱**한다. 어떤 타겟이든 §3에서 이 `NEW_PANE`에 agent를 켠다. json 경로가 타겟마다 다르므로(split은 `result.pane.pane_id`, 탭/워크스페이스는 `result.root_pane.pane_id`) 아래처럼 통일해 파싱한다. `--no-focus`로 내 포커스 유지. N개면 N번 반복.

```bash
# 새 탭 — root_pane.pane_id
NEW_PANE=$(herdr tab create --workspace "$WS" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

# pane split — pane.pane_id
NEW_PANE=$(herdr pane split "$HERDR_PANE_ID" --direction right --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')

# 새 워크스페이스 — root_pane.pane_id (워크스페이스/탭 id가 더 필요하면 result.workspace / result.tab도 같이 파싱)
NEW_PANE=$(herdr workspace create --cwd "$CWD" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
```

### 3. agent 켜고 idle까지 대기 — 핵심

ready 판정의 1차 신호로 herdr의 `agent_status`를 쓴다(화면 텍스트 아님). 새 pane은 빈 shell이라 `unknown`이고, agent를 켜면 herdr가 감지하는 순간 `idle`이 된다. 이 1차 판정은 agent 종류와 무관하게 동일하게 쓴다.

> 주의: **`idle`은 "스트리밍/작업 중이 아님"이지 "메인 프롬프트가 입력을 받을 준비됨"을 보장하지 않는다.** 로그인 / 모델 선택 / 신뢰 폴더 확인 같은 first-run 프롬프트가 떠 있어도 herdr엔 idle로 보일 수 있다. 그래서 idle 도달 후 화면을 한 번 read해 known blocker가 없는지 확인하고 보고한다(아래).

```bash
herdr pane run "$NEW_PANE" "claude"   # 또는 "codex" 등
herdr wait agent-status "$NEW_PANE" --status idle --timeout 30000
echo "exit=$?"
herdr pane read "$NEW_PANE" --source visible --lines 20   # idle 후 known blocker 점검
```

- **exit 0 + 화면에 blocker 없음 → ready.** 끝. (claude는 default mode가 auto면 그대로 auto로 떠 있다.)
- **화면에 first-run 프롬프트(로그인/모델선택/신뢰폴더 등)가 보이면** → 추측해서 키 누르지 말고 **사실대로 보고**한 뒤 사용자에게 넘긴다. 대부분 이미 설정돼 있어 실제로는 거의 안 막힌다.
- **timeout(exit 1) → 추측해서 키 누르지 말 것.** 해당 탭을 `--source recent-unwrapped`로 더 읽어 무엇이 막고 있는지 확인하고 사실대로 보고한다.

```bash
herdr pane read "$NEW_PANE" --source recent-unwrapped --lines 30   # timeout 시 진단
```

> `wait agent-status`는 level-triggered라 이미 idle이면 즉시 반환한다. 새 pane은 실행 직전 `unknown`이라 안전하다. **항상 새 pane에 켠다** (기존 agent pane 재활용 시 직전 idle을 오인할 수 있음).

### 4. 보고 — 심플한 목록

띄운 agent마다 한 줄씩. 표·장황한 로그·링크 금지.

```
- w1K:p9 (탭) — claude · idle ✓
- w1K:pA (split right) — codex · idle ✓
- w2A:p1 (새 워크스페이스 /path/to/proj) — claude · ⚠ timeout (화면: 로그인 프롬프트)
```

idle 못 띄운 건 그 줄에 무엇이 막고 있었는지 사실대로. 죽이거나 무한 재시도하지 않는다. 추가 설정(auto/rc)을 했다면 그 결과도 한 토큰으로 덧붙인다(예: `· auto ✓`).

## 핵심 원칙

- `$HERDR_PANE_ID`로만 자기 위치 판정 (`focused` 금지).
- id는 항상 응답에서 다시 파싱 (compact 가정 금지).
- ready 1차 판정은 `agent_status idle`, 그 뒤 화면 read로 first-run blocker만 한 번 확인 (idle ≠ 입력 준비됨 보장).
- 막히면 추측해서 키 누르지 말고 탭을 read해서 보고.

---

## 부록 — 추가 설정 방법

메인 흐름은 "켜서 idle 확인"까지다. 아래는 **사용자가 명시적으로 요청할 때만** 적용하는 claude 전용 추가 설정이다. (codex 등 다른 agent엔 이 개념들이 없다 — 켜는 것으로 끝.)

### auto mode 변경 (claude 전용)

default mode가 이미 auto면 불필요하다. 사용자가 특정 모드("plan으로", "auto로 바꿔")를 원하거나 default가 auto가 아닐 때만.

Shift+Tab(`\e[Z`)로 모드를 순환한다. 순서(4-state):
`normal → ⏵⏵ accept edits on → ⏸ plan mode on → ⏵⏵ auto mode on → normal`

절차 — **계산 후 검증**:
1. 현재 배지를 내용으로 read: `herdr pane read "$P" --source visible --lines 14 | grep -oE "accept edits on|plan mode on|auto mode on"` (없으면 normal).
2. 목표까지 필요한 횟수 N 계산 (예: normal→auto = 3, accept→auto = 2, plan→auto = 1).
3. `for i in $(seq 1 "$N"); do herdr pane send-text "$P" $'\e[Z'; sleep 0.4; done`
4. 다시 read해서 목표 배지 확인. 어긋났으면(버전 변화 등) `\e[Z` 한 번씩 보내며 최대 5번 보정. 그래도 안 되면 화면 상태 보고.

### rc (remote control, claude 전용)

폰/claude.ai에서 세션을 이어 쓰고 싶을 때.

```bash
herdr pane send-text "$P" "/rc"; sleep 0.6
herdr pane send-keys "$P" Enter; sleep 1.5
herdr pane read "$P" --source visible --lines 20
```

검증은 상태바의 **`/rc active` 표시 여부만** 확인한다 (리모트 링크는 파싱하지 않음). 안 보이면 화면 상태 보고.

> rc는 claude 전용이다. codex에도 `codex remote-control`이라는 별개 CLI 기능이 있지만 이 스킬의 목적(herdr 패널 안 인터랙티브 세션을 폰/claude.ai로 잇기)과 달라 **다루지 않는다.** 사용자가 codex를 리모트로 원하면 이 스킬 범위 밖임을 알린다.
