---
name: herdr-cli
description: "Control herdr from inside it. Manage workspaces and tabs, split panes, spawn agents, read output, and wait for state changes — all via CLI commands that talk to the running herdr instance over a local unix socket. Use when running inside herdr (HERDR_ENV=1)."
---

# herdr — agent skill

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

the `herdr` binary is available in your PATH. its workspace, tab, pane, and wait commands talk to the running herdr instance over a local unix socket.

if you need the raw protocol or full api reference, read the [socket api docs](https://herdr.dev/docs/socket-api/).

## concepts

**workspaces** are project contexts. each workspace has one or more tabs. unless manually renamed, a workspace's label follows the first tab's root pane — usually the repo name, otherwise the root pane's current folder name.

**tabs** are subcontexts inside a workspace. each tab has one or more panes.

**panes** are terminal splits inside a tab. each pane runs its own process — a shell, an agent, a server, anything.

**agent status** is detected automatically by herdr. the api exposes one public field for it:

- `agent_status` — `idle`, `working`, `blocked`, `done`, `unknown`

`done` means the agent finished, but you have not looked at that finished pane yet.

plain shells still exist as panes, but herdr's sidebar agent section intentionally focuses on detected agents rather than listing every shell.

**ids** — workspace ids look like `1`, `2`. tab ids look like `1:1`, `1:2`, `2:1`. pane ids look like `1-1`, `1-2`, `2-1`. these are compact public ids for the current live session.

important: ids can compact when tabs, panes, or workspaces are closed. do not treat them as durable ids. re-read ids from `workspace list`, `tab list`, `pane list`, or create/split responses when you need a current id. do not guess that an older `1-3` is still the same pane later.

## discover yourself

**you are the pane named by `$HERDR_PANE_ID`.** herdr injects this env var into every pane's shell, and your cli commands inherit it. resolve it to the current public ids — pane, tab, and workspace — with one call:

```bash
herdr pane get "$HERDR_PANE_ID"
```

the response holds your `pane_id`, `tab_id`, and `workspace_id`. "current workspace" and "current tab" mean *these* — the ones your agent pane lives in. when the task says to test in the current workspace/tab, split or create from these ids, not from whatever else is on screen.

do **not** use `focused` to find yourself. `focused:true` is whichever pane the user's herdr ui is looking at right now — often a different agent's pane entirely. when several agents run at once, multiple panes show `agent_status: working` and your own pane is usually `focused:false`. the only reliable self-signal is `$HERDR_PANE_ID`.

if `$HERDR_PANE_ID` is somehow unset, fall back to matching: compare each candidate pane's `cwd` to your working directory, and if still ambiguous, `pane read` each one and look for *this* conversation's output on screen.

see every pane and its neighbors:

```bash
herdr pane list
```

list workspaces:

```bash
herdr workspace list
```

## tab management

list tabs in the current workspace:

```bash
herdr tab list --workspace 1
```

create a new tab:

```bash
herdr tab create --workspace 1
```

without `--label`, the new tab keeps the default numbered tab name.

create and name it in one step:

```bash
herdr tab create --workspace 1 --label "logs"
```

rename it:

```bash
herdr tab rename 1:2 "logs"
```

focus it:

```bash
herdr tab focus 1:2
```

close it:

```bash
herdr tab close 1:2
```

## read another pane

see what is on another pane's screen:

```bash
herdr pane read 1-1 --source recent --lines 50
```

- `--source visible` = current viewport
- `--source recent` = recent scrollback as rendered in the pane
- `--source recent-unwrapped` = recent terminal text with soft wraps joined back together

## split a pane and run a command

split your pane to the right and keep focus on your current pane:

```bash
herdr pane split 1-2 --direction right --no-focus
```

that prints json with the new pane nested at `result.pane.pane_id`. parse that value, then run a command in that pane:

```bash
NEW_PANE=$(herdr pane split 1-2 --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
```

split downward instead:

```bash
herdr pane split 1-2 --direction down --no-focus
```

## wait for output

block until specific text appears in a pane. useful for waiting on servers, builds, and tests.

for `--source recent`, matching uses unwrapped recent terminal text, so pane width and soft wrapping do not break matches. `pane read --source recent` still shows the pane as rendered. if you want to inspect the same transcript that the waiter matches, use `pane read --source recent-unwrapped`.

```bash
herdr wait output 1-3 --match "ready on port 3000" --timeout 30000
```

with regex:

```bash
herdr wait output 1-3 --match "server.*ready" --regex --timeout 30000
```

if it times out, exit code is `1`.

## wait for an agent status

block until another agent reaches a specific status:

```bash
herdr wait agent-status 1-1 --status done --timeout 60000
```

use this when you want the same `done` / `idle` distinction the UI shows.

## wait for an agent task to complete

`wait agent-status` is level-triggered: if the pane is already in the requested status, it returns immediately. so a stale `idle` or `done` from a previous task looks identical to a fresh completion. there is no native OR between `idle` and `done`, and no `--wait done` shortcut.

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
"$RUN_WAIT" 1-3 "review the test coverage in src/api/" --timeout 120000
herdr pane read 1-3 --source recent-unwrapped --lines 120
```

recording the baseline before sending is what makes it safe: it only counts a *new* terminal status as completion, not a leftover one. if the task is so fast it returns to its previous status without the helper ever seeing `working`, the helper times out instead of guessing — read the pane and verify manually in that case.

### wait on an already-running task — `herdr-agent-wait-complete`

use this only when the task is already in flight and you did not start it through `run-and-wait`. it first waits briefly for `working` (so a pre-task `idle`/`done` is not mistaken for completion), then races `idle` / `done` / `blocked`:

```bash
"$WAIT_COMPLETE" 1-3 --timeout 120000
herdr pane read 1-3 --source recent-unwrapped --lines 120
```

if the task already finished before this helper starts, it can fail because it never sees `working`. it can run for up to `--start-timeout + --timeout` wall-clock time.

if you are sure the task is running and only want to race the terminal statuses, skip the working check:

```bash
"$WAIT_COMPLETE" 1-3 --no-wait-working --timeout 120000
```

`--no-wait-working` is unsafe for fresh tasks: it can treat an existing `idle` or `done` as completion. prefer `run-and-wait` for new prompts.

### exit codes (both helpers)

- `0` — completed as `idle` or `done`.
- `1` — failed or timed out.
- `2` — reached `blocked`; read the pane and respond instead of waiting longer.

on timeout, inspect in this order:

```bash
herdr pane get 1-3
herdr pane read 1-3 --source recent-unwrapped --lines 120
herdr pane list
```

run one task at a time per agent pane; queued tasks make status attribution ambiguous. for deterministic shell commands, prefer `wait output` on the command's own output over these agent-status helpers.

## send text or keys to a pane

send text without pressing Enter:

```bash
herdr pane send-text 1-1 "hello from claude"
```

press Enter or other keys:

```bash
herdr pane send-keys 1-1 Enter
```

`send-keys` accepts only these named keys:

```
Enter  Tab  Esc  Backspace  Up  Down  Left  Right  C-c  ctrl+c
```

Lowercase spellings also work for the basic named keys. Single-character keys also
work. For keys not on the named-key list — notably **Shift+Tab / BackTab** (e.g.
to cycle Claude's permission mode) — send the raw escape with `send-text`:

```bash
herdr pane send-text 1-1 $'\e[Z'   # Shift+Tab (BackTab)
```

`pane run` sends the text and then a real `Enter` key in one request:

```bash
herdr pane run 1-1 "echo hello"
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
herdr workspace focus 2
```

rename:

```bash
herdr workspace rename 1 "api server"
```

close:

```bash
herdr workspace close 2
```

## close a pane

```bash
herdr pane close 1-3
```

## recipes

### run a server and wait until it is ready

```bash
NEW_PANE=$(herdr pane split 1-2 --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
herdr wait output "$NEW_PANE" --match "ready" --timeout 30000
herdr pane read "$NEW_PANE" --source recent --lines 20
```

### run tests in a separate pane and inspect the result

```bash
herdr pane split 1-2 --direction down --no-focus
herdr pane run 1-3 "cargo test"
herdr wait output 1-3 --match "test result" --timeout 60000
herdr pane read 1-3 --source recent --lines 30
```

### check what another agent is working on

```bash
herdr pane list
herdr pane read 1-1 --source recent --lines 80
```

### watch another pane robustly

use this pattern when you need to coordinate with a sibling pane:

```bash
# inspect what is already there
herdr pane read 1-3 --source recent --lines 40

# wait only for the next output you expect
herdr wait output 1-3 --match "ready" --timeout 30000

# if you need to inspect the same transcript the waiter matched,
# read the unwrapped recent text directly
herdr pane read 1-3 --source recent-unwrapped --lines 40
```

### spawn a new agent and give it a task

```bash
herdr pane split 1-2 --direction right --no-focus
herdr pane run 1-3 "claude"
herdr wait output 1-3 --match ">" --timeout 15000
"$RUN_WAIT" 1-3 "review the test coverage in src/api/" --timeout 120000
herdr pane read 1-3 --source recent-unwrapped --lines 120
```

see [wait for an agent task to complete](#wait-for-an-agent-task-to-complete) for how `$RUN_WAIT` is resolved and why it is safer than a bare `wait agent-status`.

### coordinate with another agent

```bash
herdr wait agent-status 1-1 --status done --timeout 120000
herdr pane read 1-1 --source recent --lines 100
```

## notes

- `workspace list`, `workspace create`, `tab list`, `tab create`, `tab get`, `tab focus`, `tab rename`, `tab close`, `pane list`, `pane get`, `pane split`, `wait output`, and `wait agent-status` print json on success.
- `pane read` prints text, not json.
- `pane read --format ansi` or `pane read --ansi` returns a rendered ANSI snapshot for TUI feedback loops.
- `pane read --source recent-unwrapped` is useful when you want to inspect the same unwrapped transcript that `wait output --source recent` matches against.
- `pane send-text`, `pane send-keys`, and `pane run` print nothing on success.
- the `scripts/herdr-agent-run-and-wait` and `scripts/herdr-agent-wait-complete` helpers (resolved relative to this `SKILL.md`) print json and wrap `wait agent-status` so a stale `idle` / `done` is not mistaken for a fresh completion. use `run-and-wait` when sending a new task, `wait-complete` only for a task already in flight.
- parse ids from `workspace create`, `tab create`, and `pane split` responses when you need new ids. `workspace create` returns `result.workspace`, `result.tab`, and `result.root_pane`. `tab create` returns `result.tab` and `result.root_pane`. for `pane split`, the new pane id is at `result.pane.pane_id`.
- use `pane read` for current output that already exists. use `wait output` for future output you expect next.
- `--no-focus` on split, tab create, and workspace create keeps your current terminal context focused.
- without `--label`, workspace create keeps cwd-based naming and tab create keeps numbered naming.
- `--label` on tab create and workspace create applies the custom name immediately.
- if you are running inside herdr, the `HERDR_ENV` environment variable is set to `1`.