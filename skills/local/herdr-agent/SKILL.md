---
name: herdr-agent
description: "Spawn a coding agent (claude / codex / any) into a new herdr location — a new tab, a pane split, or a new workspace — then wait until it is ready (agent_status idle). Use when running inside herdr (HERDR_ENV=1) and the user asks to open/launch/spawn an agent: \"launch claude\", \"one more codex\", \"split next to me and run claude\", \"codex in a new workspace\"."
---

# herdr-agent — spawning agents in herdr

A skill for spawning a coding agent (claude / codex / anything else) into a new location inside herdr and **confirming it is ready**. Low-level herdr control is handled by the `herdr-cli` skill; this skill layers an "agent spawn" workflow on top of it.

**The core is simple: pick a location → start the agent → wait until idle → report.** Extra configuration like auto mode and rc is not part of the main flow — it lives in the [appendix](#appendix--extra-configuration) (only when the user explicitly asks).

## Main flow

### 0. Guard

If `HERDR_ENV != 1`, **stop immediately** and tell the user "not inside herdr, so I can't spawn an agent".

```bash
[ "$HERDR_ENV" = "1" ] || { echo "not inside herdr — stop"; exit 1; }   # echo alone won't stop — you must abort
herdr pane get "$HERDR_PANE_ID"   # determine my pane/tab/workspace/cwd
```

Always determine your own location via `$HERDR_PANE_ID`. `focused:true` is the pane the user's UI is looking at, not your pane.

> ids look like `w1K`, `w1K:t6`, `w1K:pA` (alphanumeric allowed). Always re-read them from the `pane get`/`list`/`split` response (they may be compacted).

### 1. Parse intent

Extract from natural language. Use defaults when unspecified.

| Item | Value | Default |
|------|-----|--------|
| Target | new tab / pane split / new workspace | new tab |
| Agent | claude / codex / other | claude |
| Count | N | 1 |
| Split direction | right / down | right |
| cwd (new workspace) | path | rule below |

Examples: "one more claude" → claude in a new tab / "split next to me and run codex" → codex in a split right / "two claudes in a new workspace" → workspace ×2.

**New-workspace cwd**: if a path is given, use it as-is. If not, default to the current cwd — but "new workspace" usually means a different project, so **if ambiguous, ask a one-line follow-up**.

> auto mode and rc are not in the main flow. If the user explicitly says "in auto mode", "with remote control", etc., see the [appendix](#appendix--extra-configuration).

### 2. Create the target

Create a pane for each target and **parse the new pane id (`NEW_PANE`) from the response json**. Whatever the target, §3 starts the agent in this `NEW_PANE`. Because the json path differs per target (split is `result.pane.pane_id`; tab/workspace are `result.root_pane.pane_id`), parse them uniformly as below. Use `--no-focus` to keep your own focus. For N, repeat N times.

```bash
# new tab — root_pane.pane_id
NEW_PANE=$(herdr tab create --workspace "$WS" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

# pane split — pane.pane_id
NEW_PANE=$(herdr pane split "$HERDR_PANE_ID" --direction right --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')

# new workspace — root_pane.pane_id (if you also need the workspace/tab id, parse result.workspace / result.tab too)
NEW_PANE=$(herdr workspace create --cwd "$CWD" --no-focus \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
```

### 3. Start the agent and wait until idle — the core

Use herdr's `agent_status` as the primary ready signal (not the on-screen text). A new pane is an empty shell, so it reads `unknown`; the moment you start the agent and herdr detects it, it becomes `idle`. This primary check is the same regardless of agent type.

> Caution: **`idle` means "not streaming / not working", not "the main prompt is ready to accept input".** First-run prompts like login / model selection / trust-folder confirmation may be on screen yet still look idle to herdr. So after reaching idle, read the screen once to check for a known blocker and report it (below).

```bash
herdr pane run "$NEW_PANE" "claude"   # or "codex", etc.
herdr wait agent-status "$NEW_PANE" --status idle --timeout 30000
echo "exit=$?"
herdr pane read "$NEW_PANE" --source visible --lines 20   # check for known blockers after idle
```

- **exit 0 + no blocker on screen → ready.** Done. (If claude's default mode is auto, it comes up in auto as-is.)
- **If a first-run prompt (login / model selection / trust folder, etc.) is on screen** → don't guess and press keys; **report the facts** and hand off to the user. Most of the time it's already configured, so this rarely actually blocks.
- **On timeout (exit 1) → do not guess and press keys.** Read that tab further with `--source recent-unwrapped` to see what is blocking, and report the facts.

```bash
herdr pane read "$NEW_PANE" --source recent-unwrapped --lines 30   # diagnose on timeout
```

> `wait agent-status` is level-triggered, so if it's already idle it returns immediately. A new pane is `unknown` right before launch, so this is safe. **Always start in a new pane** (reusing an existing agent pane can mistake its prior idle for the new one).

### 4. Report — a simple list

One line per spawned agent. No tables, no verbose logs, no links.

```
- w1K:p9 (tab) — claude · idle ✓
- w1K:pA (split right) — codex · idle ✓
- w2A:p1 (new workspace /path/to/proj) — claude · ⚠ timeout (screen: login prompt)
```

For any that didn't reach idle, state on that line what was blocking, factually. Don't kill it or retry endlessly. If you applied extra configuration (auto/rc), append the result as a single token too (e.g. `· auto ✓`).

### Beyond spawning — hand off to herdr-cli

This skill ends at "spawned and idle". If the request goes further than spawning — sending a task prompt to the spawned agent, reading its output, or waiting for that task to complete (e.g. "split next to me, run codex, and have it check the translation") — that is the `herdr-cli` skill's job. See its **`wait for an agent task to complete`** section (the `herdr-agent-run-and-wait` helper, which sends a prompt and safely waits for `working → idle/done`) and the **`spawn a new agent and give it a task`** recipe, which chains the full flow end to end.

## Core principles

- Determine your own location only via `$HERDR_PANE_ID` (never `focused`).
- Always re-parse ids from the response (don't assume they stay stable after compaction).
- The primary ready check is `agent_status idle`; after that, read the screen once to check only for first-run blockers (idle ≠ guaranteed ready for input).
- If blocked, don't guess and press keys — read the tab and report.
- Scope is spawning to idle. For anything past that (task prompt, output, completion wait), use the `herdr-cli` skill.

---

## Appendix — extra configuration

The main flow ends at "start and confirm idle". Below is claude-only extra configuration, applied **only when the user explicitly requests it**. (Other agents like codex don't have these concepts — starting them is all there is.)

### Changing auto mode (claude only)

Unnecessary if the default mode is already auto. Only when the user wants a specific mode ("in plan mode", "switch to auto") or the default isn't auto.

Cycle modes with Shift+Tab (`\e[Z`). Order (4-state):
`normal → ⏵⏵ accept edits on → ⏸ plan mode on → ⏵⏵ auto mode on → normal`

Procedure — **compute, then verify**:
1. Read the current badge by content: `herdr pane read "$P" --source visible --lines 14 | grep -oE "accept edits on|plan mode on|auto mode on"` (none → normal).
2. Compute the number of presses N needed to reach the target (e.g. normal→auto = 3, accept→auto = 2, plan→auto = 1).
3. `for i in $(seq 1 "$N"); do herdr pane send-text "$P" $'\e[Z'; sleep 0.4; done`
4. Read again and confirm the target badge. If it's off (e.g. version change), send `\e[Z` one at a time to correct, up to 5 times. If still wrong, report the screen state.

### rc (remote control, claude only)

For when you want to continue the session from your phone / claude.ai.

```bash
herdr pane send-text "$P" "/rc"; sleep 0.6
herdr pane send-keys "$P" Enter; sleep 1.5
herdr pane read "$P" --source visible --lines 20
```

For verification, only check **whether the status bar shows `/rc active`** (don't parse the remote link). If it's not shown, report the screen state.

> rc is claude-only. codex has a separate CLI feature called `codex remote-control`, but it differs from this skill's purpose (bridging an interactive session inside a herdr pane to phone/claude.ai), so it is **not covered.** If the user wants remote control for codex, tell them it's out of scope for this skill.
