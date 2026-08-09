---
name: kaku-cli
description: >
  Reference for `kaku cli ...` — Kaku's experimental mux server control CLI
  for listing/spawning/splitting/activating panes, tabs, windows, and
  workspaces, plus send-text/get-text. Use ONLY when the user explicitly
  mentions `kaku` or `kaku cli` in their request. Do NOT invoke for general
  terminal, tmux, cmux, or other mux-related questions.
---

# kaku cli

`kaku cli` talks to Kaku's experimental mux server to control panes, tabs,
windows, and workspaces from the shell. The interface mirrors
`wezterm cli` (Kaku is built on the WezTerm core).

Most subcommands accept `--pane-id <ID>`. When omitted, the value of the
`WEZTERM_PANE` environment variable (set automatically inside a Kaku pane)
is used.

`kaku cli spawn` and `kaku cli split-pane` print the new pane id to stdout
on success — capture it for chained scripting.

## Global options (on `kaku cli` itself)

- `--no-auto-start` — don't auto-start the mux server.
- `--prefer-mux` — prefer connecting to a background mux server instead of
  a running GUI instance.
- `--class <CLASS>` — match a GUI started with `--class SOMETHING`.

## Subcommands

### Inspect

- **`list [--format table|json]`** — list windows, tabs, and panes.
  - `kaku cli list --format json | jq '.[] | .pane_id'`
- **`list-clients [--format table|json]`** — list connected clients.
- **`get-text [--pane-id ID] [--start-line N] [--end-line N] [--escapes]`**
  — dump pane text to stdout. Negative line numbers reach into scrollback.
  - `kaku cli get-text --start-line -100`  *(last 100 scrollback lines)*
- **`get-pane-direction <Up|Down|Left|Right|Next|Prev> [--pane-id ID]`** —
  print the pane id in that direction (empty if none).

### Spawn / split

- **`spawn [--new-window] [--cwd PATH] [--workspace NAME] [--window-id ID]
  [--domain-name NAME] [--pane-id ID] -- [PROG...]`** — open a new tab (or
  window with `--new-window`). Without `PROG`, your shell runs.
  - `kaku cli spawn -- htop`
  - `kaku cli spawn --new-window --cwd ~/code -- nvim`
- **`split-pane [--left|--right|--top|--bottom|--horizontal] [--top-level]
  [--cells N | --percent N] [--cwd PATH] [--pane-id ID]
  [--move-pane-id ID] -- [PROG...]`** — split the current (or specified)
  pane. Default direction is `--bottom`. `--horizontal` is an alias for
  `--right`. Use `--move-pane-id` to relocate an existing pane into the
  new split instead of spawning a program.
  - `kaku cli split-pane --right --percent 40`
  - `kaku cli split-pane --bottom --cells 12 -- tail -f /var/log/system.log`
- **`move-pane-to-new-tab [--pane-id ID] [--window-id ID] [--new-window]
  [--workspace NAME]`** — move a pane into its own tab (optionally in a
  new window/workspace).

### Activate / focus

- **`activate-pane [--pane-id ID]`** — focus a pane.
- **`activate-pane-direction <Up|Down|Left|Right|Next|Prev> [--pane-id ID]`**
  — focus the adjacent pane in a direction.
- **`activate-tab [--tab-id ID | --tab-index N | --tab-relative N
  [--no-wrap]] [--pane-id ID]`** — activate a tab by id, absolute index
  (negatives count from the right), or relative offset.
  - `kaku cli activate-tab --tab-index 0`        *(leftmost tab)*
  - `kaku cli activate-tab --tab-relative 1`     *(next tab, wraps)*

### Modify

- **`send-text [--pane-id ID] [--no-paste] [TEXT]`** — send text to a pane
  as if pasted (bracketed paste by default). Reads stdin when `TEXT` is
  omitted. With `--no-paste`, the text goes through as keystrokes — the
  pane's shell will execute it as a command. Be careful.
  - `echo "ls -la" | kaku cli send-text --pane-id 3 --no-paste`
- **`adjust-pane-size <Up|Down|Left|Right|Next|Prev> [--amount N]
  [--pane-id ID]`** — resize directionally; default amount is 1 cell.
- **`zoom-pane [--zoom | --unzoom | --toggle] [--pane-id ID]`** — zoom
  state of a pane.
- **`kill-pane [--pane-id ID]`** — kill a pane. **Destructive** — confirm
  before running on someone else's session.

### Naming

- **`set-tab-title <TITLE> [--tab-id ID] [--pane-id ID]`**
- **`set-window-title <TITLE> [--window-id ID] [--pane-id ID]`**
- **`rename-workspace <NEW_NAME> [--workspace NAME] [--pane-id ID]`**

### Server / RPC

- **`proxy`** — start an RPC proxy pipe (used by tooling that speaks the
  mux protocol over stdio).
- **`tlscreds [--pem]`** — obtain TLS credentials for the mux server.
  `--pem` writes a PEM-encoded copy. **Sensitive** — anyone with these
  credentials can connect to the mux server and start a shell with no
  further authentication. Treat them like an SSH private key.

## Common recipes

```sh
# Split current pane to the right at 40% and run a program
kaku cli split-pane --right --percent 40 -- watch -n1 date

# Open a new window in a project directory
kaku cli spawn --new-window --cwd ~/code -- nvim

# Capture the last 200 lines of a pane (incl. scrollback)
kaku cli get-text --pane-id 7 --start-line -200 > pane.log

# Pipe a command into another pane (executes there)
echo "make test" | kaku cli send-text --pane-id 7 --no-paste
printf '\n' | kaku cli send-text --pane-id 7 --no-paste

# Walk panes programmatically
kaku cli list --format json
```

## Notes for Claude

- `kaku ai` and `kaku config` (top-level, not `cli`) are interactive TUIs —
  don't invoke them in non-interactive shells; ask the user to run them.
- `kill-pane`, `tlscreds --pem`, and `send-text --no-paste` have real
  consequences (data loss, credential exposure, arbitrary command
  execution in another pane). Confirm with the user before running.
- When pane/tab/window ids are needed, `kaku cli list --format json` is the
  source of truth.
- When spawning a new tab, always pass `--cwd $PWD` so it opens in the same
  directory as the current working directory.
  - `kaku cli spawn --cwd $PWD`
