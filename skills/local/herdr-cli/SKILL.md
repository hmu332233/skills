---
name: herdr-cli
description: "Control herdr from inside it. Manage workspaces and tabs, split panes, spawn agents, read output, and wait for state changes — all via CLI commands that talk to the running herdr instance over a local unix socket. Use when running inside herdr (HERDR_ENV=1)."
---

# herdr — agent skill

written against herdr 0.7.3 (socket protocol 16). if commands here disagree with `herdr <cmd> --help`, trust the help output and mention the drift.

before using this skill, check that `HERDR_ENV=1`. if it is not set to `1`, say you are not running inside a herdr-managed pane and stop. do not inspect or control the focused herdr pane from outside herdr.

you are running inside herdr, a terminal-native agent multiplexer. herdr gives you workspaces, tabs, and panes — each pane is a real terminal with its own shell, agent, server, or log stream — and you can control all of it from the cli.

this means you can:

- see what other panes and agents are doing
- create tabs for separate subcontexts inside one workspace
- split panes and run commands in them
- start servers, watch logs, and run tests in sibling panes
- wait for specific output before continuing
- wait for another agent to finish
- spawn more agent instances
- send the user a desktop notification

the `herdr` binary is available in your PATH. its workspace, tab, pane, agent, and wait commands talk to the running herdr instance over a local unix socket.

if you need the raw protocol or full api reference, read the [socket api docs](https://herdr.dev/docs/socket-api/) or run `herdr api schema --json`.

## concepts

**workspaces** are project contexts. each workspace has one or more tabs. unless manually renamed, a workspace's label follows the first tab's root pane — usually the repo name, otherwise the root pane's current folder name.

**tabs** are subcontexts inside a workspace. each tab has one or more panes.

**panes** are terminal splits inside a tab. each pane runs its own process — a shell, an agent, a server, anything.

**agent status** is detected automatically by herdr (via screen detection, or hooks when an integration is installed). the api exposes one public field for it:

- `agent_status` — `idle`, `working`, `blocked`, `done`, `unknown`

`done` is a **UI attention state**: the agent finished but the user has not looked at that pane yet. viewing the pane clears it back to `idle`. so for CLI waits, `idle` is the completion signal — never wait on `done` alone (see [wait for an agent status](#wait-for-an-agent-status)).

plain shells still exist as panes, but herdr's agent commands and sidebar intentionally focus on detected agents rather than listing every shell.

**ids** — workspace ids look like `w1`, `w2`. tab ids look like `w1:t1`, `w1:t2`. pane ids look like `w1:p1`, `w1:p2`. every pane also has a durable `terminal_id` like `term_6562de4826a061`. the `herdr agent` commands additionally accept a unique agent name (set via `agent start` or `agent rename`) as the target.

important: the compact public ids can change when tabs, panes, or workspaces are closed. do not treat them as durable. re-read ids from `pane current`, `workspace list`, `tab list`, `pane list`, `agent list`, or create/split/start responses when you need a current id. do not guess that an older `w1:p3` is still the same pane later.

## discover yourself

resolve your own pane, tab, and workspace with one call:

```bash
herdr pane current
```

the response holds your `pane_id`, `tab_id`, `workspace_id`, `cwd`, and `agent_status`. "current workspace" and "current tab" mean *these* — the ones your agent pane lives in. when the task says to test in the current workspace/tab, split or create from these ids, not from whatever else is on screen.

herdr also injects `$HERDR_PANE_ID` into every pane's shell; `herdr pane get "$HERDR_PANE_ID"` is the equivalent explicit form.

do **not** use `focused` to find yourself. `focused:true` is whichever pane the user's herdr ui is looking at right now — often a different agent's pane entirely. when several agents run at once, multiple panes show `agent_status: working` and your own pane is usually `focused:false`. the only reliable self-signals are `pane current` and `$HERDR_PANE_ID`.

see every pane and its neighbors:

```bash
herdr pane list
```

see only the detected agents:

```bash
herdr agent list
```

list workspaces:

```bash
herdr workspace list
```

## the `herdr agent` commands

a higher-level command family for working with detected agents. `<target>` accepts a pane id, a terminal id, or a unique agent name/label:

```bash
herdr agent list                                   # all detected agents with status, cwd, ids
herdr agent get <target>                           # one agent's info
herdr agent read <target> --lines 80               # read its screen (prints json with the text inside)
herdr agent send <target> "some text"              # literal text, no Enter — use pane run for text+Enter
herdr agent wait <target> --status idle --timeout 60000
herdr agent rename <target> "reviewer"             # name it; the name then works as a target
herdr agent focus <target>                         # move the user's focus to it
herdr agent explain <target> --json                # why herdr thinks the status is what it is
herdr agent start <name> ... -- <argv...>          # spawn an agent (see below)
```

`agent explain` is the first tool to reach for when a status looks wrong or a wait times out — it shows which detection rule or hook produced the current status.

**agent targets resolve at call time.** a pane whose agent has not been detected yet — e.g. you launched `claude` there a moment ago — fails with `agent_not_found`. for freshly launched agents, use the pane-id forms (`wait agent-status`, `pane read`, `pane run`) until the agent shows up in `agent list`.

note the output difference: `agent read` prints json (text under `result.read.text`), while `pane read` prints plain text.

## tab management

list tabs in the current workspace:

```bash
herdr tab list --workspace w1
```

create a new tab:

```bash
herdr tab create --workspace w1
```

without `--label`, the new tab keeps the default numbered tab name. `--cwd PATH` starts the tab's root pane in a different directory; `--env KEY=VALUE` injects environment variables.

create and name it in one step:

```bash
herdr tab create --workspace w1 --label "logs"
```

rename it:

```bash
herdr tab rename w1:t2 "logs"
```

focus it:

```bash
herdr tab focus w1:t2
```

close it:

```bash
herdr tab close w1:t2
```

## read another pane

see what is on another pane's screen:

```bash
herdr pane read w1:p1 --source recent --lines 50
```

- `--source visible` = current viewport
- `--source recent` = recent scrollback as rendered in the pane
- `--source recent-unwrapped` = recent terminal text with soft wraps joined back together

## split a pane and run a command

split your pane to the right and keep focus on your current pane:

```bash
herdr pane split w1:p2 --direction right --no-focus
```

that prints json with the new pane nested at `result.pane.pane_id`. parse that value, then run a command in that pane:

```bash
NEW_PANE=$(herdr pane split w1:p2 --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
```

split downward instead:

```bash
herdr pane split w1:p2 --direction down --no-focus
```

`pane split` also accepts `--ratio FLOAT` (split size), `--cwd PATH` (start the new pane elsewhere), and `--env KEY=VALUE`.

## wait for output

block until specific text appears in a pane. useful for waiting on servers, builds, and tests.

for `--source recent`, matching uses unwrapped recent terminal text, so pane width and soft wrapping do not break matches. `pane read --source recent` still shows the pane as rendered. if you want to inspect the same transcript that the waiter matches, use `pane read --source recent-unwrapped`.

```bash
herdr wait output w1:p3 --match "ready on port 3000" --timeout 30000
```

with regex:

```bash
herdr wait output w1:p3 --match "server.*ready" --regex --timeout 30000
```

if it times out, exit code is `1`.

## wait for an agent status

block until an agent reaches a specific status:

```bash
herdr agent wait w1:p1 --status idle --timeout 60000
```

`agent wait` only resolves already-detected agents — on a freshly launched, not-yet-detected agent it fails immediately with `agent_not_found`. in that case use the pane-level form, which works on any pane:

```bash
herdr wait agent-status w1:p1 --status idle --timeout 60000
```

`agent wait` refuses `--status done` by design — herdr's own error says: *"done is a UI attention state; use idle for CLI agent completion waits"*. an agent that finished shows `done` only until the user views the pane, then flips to `idle`; which one you observe depends on the user, not the agent.

the older form still exists and does accept `done` (plus `--status done|idle|working|blocked|unknown`):

```bash
herdr wait agent-status w1:p1 --status done --timeout 60000
```

use it only when you deliberately want the UI's `done`/`idle` distinction. for "wait until that agent finishes", prefer the helper scripts below — they race `idle` and `done` so either outcome counts.

## wait for an agent task to complete

`agent wait` and `wait agent-status` are level-triggered: if the pane is already in the requested status, they return immediately. so a stale `idle` or `done` from a previous task looks identical to a fresh completion. there is no native OR between `idle` and `done`, and no `--wait done` shortcut.

two helper scripts wrap this safely. resolve them relative to this `SKILL.md`:

```bash
HERDR_CLI_SKILL_DIR=<directory containing this SKILL.md>
RUN_WAIT="$HERDR_CLI_SKILL_DIR/scripts/herdr-agent-run-and-wait"
WAIT_COMPLETE="$HERDR_CLI_SKILL_DIR/scripts/herdr-agent-wait-complete"
```

both treat `idle` and `done` as completion, and `blocked` as needs-attention.

### send a new task and wait — `herdr-agent-run-and-wait`

use this whenever you are about to send a prompt. it records the pane's baseline status, sends the prompt, then waits for `working`, `idle`, `done`, or `blocked`:

```bash
"$RUN_WAIT" w1:p3 "review the test coverage in src/api/" --timeout 120000
herdr pane read w1:p3 --source recent-unwrapped --lines 120
```

recording the baseline before sending is what makes it safe: it only counts a *new* terminal status as completion, not a leftover one. if the task is so fast it returns to its previous status without the helper ever seeing `working`, the helper times out instead of guessing — read the pane and verify manually in that case.

the one case it cannot disambiguate: if the pane is **already `working`** when you send, the previous task's completion is indistinguishable from your task's. never send into a working pane — wait for it to finish first.

### wait on an already-running task — `herdr-agent-wait-complete`

use this only when the task is already in flight and you did not start it through `run-and-wait`. it first waits briefly for `working` (so a pre-task `idle`/`done` is not mistaken for completion), then races `idle` / `done` / `blocked`:

```bash
"$WAIT_COMPLETE" w1:p3 --timeout 120000
herdr pane read w1:p3 --source recent-unwrapped --lines 120
```

if the task already finished before this helper starts, it can fail because it never sees `working`. it can run for up to `--start-timeout + --timeout` wall-clock time.

if you are sure the task is running and only want to race the terminal statuses, skip the working check:

```bash
"$WAIT_COMPLETE" w1:p3 --no-wait-working --timeout 120000
```

`--no-wait-working` is unsafe for fresh tasks: it can treat an existing `idle` or `done` as completion. prefer `run-and-wait` for new prompts.

### exit codes (both helpers)

- `0` — completed as `idle` or `done`.
- `1` — failed or timed out.
- `2` — reached `blocked`; read the pane and respond instead of waiting longer.

on timeout, inspect in this order:

```bash
herdr agent explain w1:p3 --json
herdr pane get w1:p3
herdr pane read w1:p3 --source recent-unwrapped --lines 120
herdr pane list
```

one observed timeout cause: an atomic text+Enter (`pane run`) can race the TUI's paste handling, which swallows the Enter and leaves the prompt sitting unsubmitted in the input box — the task never starts and the status never changes. `run-and-wait` avoids this by sending the text and the Enter as separate requests with a short pause. if you sent a prompt with bare `pane run` and the pane read shows it unsubmitted at the input line, submit it with `herdr pane send-keys <pane_id> Enter` and wait with `wait-complete` (the task is then in flight).

run one task at a time per agent pane; queued tasks make status attribution ambiguous. for deterministic shell commands, prefer `wait output` on the command's own output over these agent-status helpers.

## send text or keys to a pane

send text without pressing Enter:

```bash
herdr pane send-text w1:p1 "hello from claude"
```

press Enter or other keys:

```bash
herdr pane send-keys w1:p1 Enter
```

`send-keys` accepts only these named keys:

```
Enter  Tab  Esc  Backspace  Up  Down  Left  Right  C-c  ctrl+c
```

Lowercase spellings also work for the basic named keys. Single-character keys also
work. For keys not on the named-key list — notably **Shift+Tab / BackTab** (e.g.
to cycle Claude's permission mode) — send the raw escape with `send-text`:

```bash
herdr pane send-text w1:p1 $'\e[Z'   # Shift+Tab (BackTab)
```

`pane run` sends the text and then a real `Enter` key in one request:

```bash
herdr pane run w1:p1 "echo hello"
```

## workspace management

create a new workspace:

```bash
herdr workspace create --cwd /path/to/project
```

without `--label`, the new workspace keeps the default cwd-based name.

create and name one in one step:

```bash
herdr workspace create --cwd /path/to/project --label "api server"
```

create one without focusing it:

```bash
herdr workspace create --no-focus
```

focus a workspace:

```bash
herdr workspace focus w2
```

rename:

```bash
herdr workspace rename w1 "api server"
```

close:

```bash
herdr workspace close w2
```

## spawn an agent with `agent start`

`agent start` creates a pane, launches the agent, registers it under a name, and returns everything in one call. the new pane's id is at `result.agent.pane_id`:

```bash
NEW_PANE=$(herdr agent start reviewer --workspace w1 --no-focus -- claude \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["agent"]["pane_id"])')
```

options: `--cwd PATH`, `--workspace ID`, `--tab ID`, `--split right|down`, `--env KEY=VALUE`, `--focus|--no-focus`. everything after `--` is the agent's argv.

the name (`reviewer` above) then works as a target for `agent wait`, `agent read`, and `agent send` — more readable than pane ids in reports. the helper scripts and the `pane`/`wait` commands are pane-id only: pass them `result.agent.pane_id`, not the name.

**caveat**: `--split` takes no anchor pane, so herdr picks which pane to split — not necessarily yours. for "split *next to me*", use `pane split "$HERDR_PANE_ID"` + `pane run` instead (see [split a pane and run a command](#split-a-pane-and-run-a-command)).

after starting, confirm readiness with `wait agent-status --status idle` (a fresh pane reads `unknown` until the agent is detected — and `agent wait` would fail with `agent_not_found` until detection happens), then check the screen once for first-run blockers (login / trust prompts look idle):

```bash
herdr wait agent-status "$NEW_PANE" --status idle --timeout 30000
herdr pane read "$NEW_PANE" --source visible --lines 20
```

## notify the user

send a desktop toast — useful when a long task finishes and the user may be looking elsewhere:

```bash
herdr notification show "tests passed" --body "42 passed, 0 failed" --sound done
```

`--position top-left|top-right|bottom-left|bottom-right`, `--sound none|done|request`. use `request` when you are blocked and need the user, `done` when work finished. don't spam these — one per meaningful event.

## close a pane

```bash
herdr pane close w1:p3
```

## more pane control

occasionally useful; run `herdr pane --help` for exact flags:

- `pane rename <pane_id> <label>` — label a pane so the user's sidebar makes sense (`--clear` to reset)
- `pane move <pane_id> --tab <tab_id> --split right|down` / `--new-tab` / `--new-workspace` — relocate a pane
- `pane zoom`, `pane resize`, `pane swap`, `pane focus --direction` — layout control
- `pane process-info`, `pane layout`, `pane neighbor`, `pane edges` — inspect layout and running processes

## recipes

### run a server and wait until it is ready

```bash
NEW_PANE=$(herdr pane split "$HERDR_PANE_ID" --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
herdr wait output "$NEW_PANE" --match "ready" --timeout 30000
herdr pane read "$NEW_PANE" --source recent --lines 20
```

### restart a dev server in its pane

stop with `C-c`, give the process a moment to die, restart, then wait for the ready line. alternation in the regex covers servers with more than one possible ready message:

```bash
herdr pane send-keys "$SERVER_PANE" C-c
sleep 1
herdr pane run "$SERVER_PANE" "npm start"
herdr wait output "$SERVER_PANE" --match "(listening on port|ready)" --regex --timeout 40000
```

### run tests in a separate pane and inspect the result

```bash
NEW_PANE=$(herdr pane split "$HERDR_PANE_ID" --direction down --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "cargo test"
herdr wait output "$NEW_PANE" --match "test result" --timeout 60000
herdr pane read "$NEW_PANE" --source recent --lines 30
```

### survey panes and agents at a glance

one-line table of every pane (id, agent, status, cwd):

```bash
herdr pane list | python3 -c 'import sys,json; [print(p["pane_id"], p.get("agent") or "shell", p.get("agent_status"), p.get("cwd")) for p in json.load(sys.stdin)["result"]["panes"]]'
```

peek at a single pane's status:

```bash
herdr pane get w1:p3 | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["agent_status"])'
```

then read the interesting one:

```bash
herdr agent list
herdr agent read w1:p1 --lines 80
```

### watch another pane robustly

use this pattern when you need to coordinate with a sibling pane:

```bash
# inspect what is already there
herdr pane read w1:p3 --source recent --lines 40

# wait only for the next output you expect
herdr wait output w1:p3 --match "ready" --timeout 30000

# if you need to inspect the same transcript the waiter matched,
# read the unwrapped recent text directly
herdr pane read w1:p3 --source recent-unwrapped --lines 40
```

### spawn a new agent and give it a task

```bash
NEW_PANE=$(herdr pane split "$HERDR_PANE_ID" --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "claude"
herdr wait agent-status "$NEW_PANE" --status idle --timeout 30000
"$RUN_WAIT" "$NEW_PANE" "review the test coverage in src/api/" --timeout 120000
herdr pane read "$NEW_PANE" --source recent-unwrapped --lines 120
```

readiness comes from `wait agent-status --status idle` (a fresh pane is `unknown` until the agent is detected; `agent wait` cannot target it until then), not from matching prompt characters on screen. see [wait for an agent task to complete](#wait-for-an-agent-task-to-complete) for how `$RUN_WAIT` is resolved and why it is safer than a bare status wait.

### coordinate with another agent

```bash
"$WAIT_COMPLETE" w1:p1 --timeout 120000
herdr pane read w1:p1 --source recent --lines 100
```

### ask an agent in another workspace a question

send the question with `run-and-wait`, then read the answer off the target's screen. open with a minimal identity header — you are in herdr, and this came from **your pane id**. that alone lets the other agent reach you back (read your terminal, send you a message by id) without guessing which pane you are:

```bash
read -r -d '' BODY <<'EOF'
this gateway calls your login API. tell me, with file:line evidence:
(1) the endpoint path/method and required params
(2) the session cookie it sets on success
EOF
HDR="[herdr: from pane $HERDR_PANE_ID]"
"$RUN_WAIT" w10:p2 "$HDR
$BODY" --timeout 180000
herdr pane read w10:p2 --source recent-unwrapped --lines 120
```

- put the question body in a quoted heredoc — long prompts with quotes/backticks survive intact.
- ask for a **concise** answer: you read the reply from the pane's recent scrollback, and a sprawling answer can scroll past the window and force a follow-up question.
- one question at a time per target pane; a second prompt while the first is running makes status attribution ambiguous.

## notes

- `workspace list`, `workspace create`, `tab list`, `tab create`, `tab get`, `tab focus`, `tab rename`, `tab close`, `pane list`, `pane current`, `pane get`, `pane split`, `wait output`, `wait agent-status`, and the `agent` subcommands print json on success (`agent explain` prints text unless you pass `--json`).
- `pane read` prints text, not json. `agent read` prints json with the text at `result.read.text`.
- `pane read --format ansi` or `pane read --ansi` returns a rendered ANSI snapshot for TUI feedback loops.
- `pane read --source recent-unwrapped` is useful when you want to inspect the same unwrapped transcript that `wait output --source recent` matches against.
- `pane send-text`, `pane send-keys`, and `pane run` print nothing on success. `agent send` sends literal text without Enter.
- the `scripts/herdr-agent-run-and-wait` and `scripts/herdr-agent-wait-complete` helpers (resolved relative to this `SKILL.md`) print json and wrap `wait agent-status` so a stale `idle` / `done` is not mistaken for a fresh completion. use `run-and-wait` when sending a new task, `wait-complete` only for a task already in flight.
- parse ids from create/split/start responses when you need new ids. `workspace create` returns `result.workspace`, `result.tab`, and `result.root_pane`. `tab create` returns `result.tab` and `result.root_pane`. for `pane split`, the new pane id is at `result.pane.pane_id`. for `agent start`, it is at `result.agent.pane_id`.
- your shell variables do not survive between your own tool calls. persist a pane id you will need again to a scratch file right after creating it — `echo "$SERVER_PANE" > "$SCRATCH/server_pane.txt"` — and restore it later with `SERVER_PANE=$(cat "$SCRATCH/server_pane.txt")`. (or `pane rename` it and find it again in `pane list` by label.)
- use `pane read` for current output that already exists. use `wait output` for future output you expect next.
- `--no-focus` on split, tab create, workspace create, and agent start keeps your current terminal context focused.
- without `--label`, workspace create keeps cwd-based naming and tab create keeps numbered naming. `--label` applies the custom name immediately.
- if you are running inside herdr, the `HERDR_ENV` environment variable is set to `1`, and `$HERDR_PANE_ID` names your own pane.
