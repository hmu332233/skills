---
name: cmux-cli
description: >
  Reference for `cmux ...` — cmux's Unix-socket control CLI for managing
  windows, workspaces, panes, surfaces (tabs), and an embedded browser,
  plus send/read-screen and tmux-compatibility commands. Use ONLY when
  the user explicitly mentions `cmux` in their request. Do NOT invoke
  for general terminal, tmux, kaku, or other mux-related questions.
---

# cmux

`cmux` controls a running cmux app via a Unix socket. The hierarchy is:

```
window > workspace > pane > surface (tab)
```

A *surface* is a terminal or browser tab inside a pane. Panes split a
workspace; workspaces live inside a window.

## When info is missing, run `--help`

This reference is a high-signal summary, not a full manual. When the user
asks for something not covered here, or when a flag/subcommand looks
ambiguous, **run `cmux <command> --help` (or `cmux --help`) before
guessing**. The help output is the source of truth — prefer it over
inference. Example: `cmux browser snapshot --help`, `cmux tab-action --help`.

If a command fails with an unfamiliar error, re-check `--help` for
required flags before retrying.

## Identifiers

Commands accept any of these for `--workspace`, `--pane`, `--surface`,
`--window`:

- **UUIDs** — full ids
- **short refs** — `window:1`, `workspace:2`, `pane:3`, `surface:4`
  (`tab-action` and `rename-tab` also accept `tab:<n>`)
- **indexes** — bare integers

`cmux list-workspaces`, `cmux list-panes`, `cmux list-pane-surfaces`, and
`cmux tree` enumerate ids. Add `--id-format uuids` or `--id-format both`
when you need UUIDs in output (defaults to refs).

## Environment defaults (inside a cmux terminal)

- `CMUX_WORKSPACE_ID` — default `--workspace` for nearly every command
- `CMUX_SURFACE_ID` — default `--surface`
- `CMUX_TAB_ID` — default `--tab` for `tab-action` / `rename-tab`
- `CMUX_SOCKET_PATH` — override socket path (defaults to
  `~/Library/Application Support/cmux/cmux.sock`, with auto-discovery)
- `CMUX_SOCKET_PASSWORD` — socket auth (or pass `--password`, or save in
  Settings)

So inside cmux, `cmux send "ls\n"` already targets the current surface.

## Common commands

### Open / inspect

- **`cmux <path>`** — open a directory as a new workspace (launches cmux
  if not running). Ergonomic shortcut.
- **`cmux tree [--all] [--workspace ...]`** — full hierarchy.
- **`cmux list-windows` / `list-workspaces` / `list-panes` /
  `list-pane-surfaces`** — flat listings.
- **`cmux current-window` / `current-workspace`** — context.
- **`cmux ping` / `version` / `capabilities`** — health/feature checks.

### Workspaces

- **`cmux new-workspace [--name T] [--description D] [--cwd PATH]
  [--command TEXT]`** — `--command` sends text + Enter after creation.
- **`cmux select-workspace --workspace <ref>`** — focus.
- **`cmux close-workspace --workspace <ref>`** — close. *Destructive.*
- **`cmux rename-workspace [--workspace <ref>] <title>`**
- **`cmux move-workspace-to-window --workspace <ref> --window <ref>`**
- **`cmux reorder-workspace --workspace <ref> (--index N | --before X |
  --after X) [--window <ref>]`**
- **`cmux workspace-action --action <name> [--title] [--color] ...`** —
  generic action hook (run `--help` for the action list).

### Windows

- **`cmux new-window` / `focus-window --window <ref>` /
  `close-window --window <ref>`** — *close is destructive.*

### Panes & splits

- **`cmux new-split <left|right|up|down> [--workspace] [--surface]
  [--panel]`** — split off a new pane.
- **`cmux new-pane [--type terminal|browser] [--direction L|R|U|D]
  [--workspace] [--url <url>]`**
- **`cmux focus-pane --pane <ref>`**
- **`cmux resize-pane --pane <ref> (-L|-R|-U|-D) [--amount N]`** (tmux-compat)
- **`cmux swap-pane --pane <ref> --target-pane <ref>`**
- **`cmux break-pane` / `join-pane --target-pane <ref>`**
- **`cmux last-pane`**

### Surfaces (tabs)

- **`cmux new-surface [--type terminal|browser] [--pane <ref>] [--url <url>]`**
- **`cmux close-surface [--surface <ref>]`** — *destructive.*
- **`cmux move-surface --surface <ref> [--pane] [--workspace] [--window]
  [--before|--after|--index] [--focus true|false]`**
- **`cmux reorder-surface --surface <ref> (--index N | --before X | --after X)`**
- **`cmux drag-surface-to-split --surface <ref> <left|right|up|down>`**
- **`cmux tab-action --action <name> [--tab <ref>] [--title] [--url] ...`**
  — run `cmux tab-action --help` for the action vocabulary.
- **`cmux rename-tab [--tab <ref>] <title>`**
- **`cmux refresh-surfaces`**

### Send / read terminal

- **`cmux send [--workspace] [--surface] [--] <text>`** — `\n` / `\r` send
  Enter, `\t` sends Tab. Defaults to `$CMUX_SURFACE_ID`.
  - `cmux send "echo hello\n"`
- **`cmux send-key [--surface] <key>`** — single keystroke.
- **`cmux send-panel --panel <ref> <text>` / `send-key-panel`** — target a
  panel surface instead of a workspace surface.
- **`cmux read-screen [--surface] [--scrollback] [--lines N]`** — dump
  text. `--lines` implies `--scrollback`.
  - `cmux read-screen --scrollback --lines 200`

### Notifications

- **`cmux notify --title T [--subtitle S] [--body B]`**
- **`cmux list-notifications` / `clear-notifications`**

### Browser surfaces (`cmux browser ...`)

cmux can host a browser surface controlled like Playwright. Common:

- **`cmux browser open [url]`** — create a browser split in the caller's
  workspace; if `--surface` is given, behaves like `navigate`.
- **`cmux browser goto|navigate <url> [--snapshot-after]`**
- **`cmux browser back|forward|reload`**
- **`cmux browser snapshot [--interactive] [--cursor] [--compact]
  [--max-depth N] [--selector <css>]`** — accessibility tree of the page.
- **`cmux browser click|type|fill|press|select|hover|focus|check|scroll
  ... [--snapshot-after]`** — interaction.
- **`cmux browser wait [--selector] [--text] [--url-contains]
  [--load-state interactive|complete] [--function <js>] [--timeout-ms]`**
- **`cmux browser get <url|title|text|html|value|attr|count|box|styles>`**
- **`cmux browser screenshot [--out PATH] [--json]`**
- **`cmux browser eval <script>`** — *runs arbitrary JS in the page; treat
  as untrusted-side execution.*
- **`cmux browser cookies|storage|tab|console|errors|dialog|download ...`**

The browser surface is large — when in doubt, `cmux browser <sub> --help`.

### tmux compatibility

`capture-pane`, `pipe-pane`, `wait-for`, `next-window` / `previous-window`
/ `last-window`, `find-window`, `clear-history`, `set-hook`, `popup`,
`bind-key` / `unbind-key`, `copy-mode`, `set-buffer` / `list-buffers` /
`paste-buffer`, `respawn-pane`, `display-message` — useful for porting
tmux scripts. Check `--help` for exact flags; semantics may not be 1:1.

### Other

- **`cmux ssh <destination> [--name] [--port] [--identity]
  [--ssh-option] [--no-focus] [-- <remote-command-args>]`** — open an SSH
  workspace.
- **`cmux markdown [open] <path>`** — markdown viewer panel with live reload.
- **`cmux rpc <method> [json-params]`** — raw RPC; advanced.
- **`cmux identify`** — print info about the current workspace/surface
  (useful inside scripts).
- **`cmux claude-teams [args]`**, **`omo` / `omx` / `omc`**,
  **`codex install-hooks|uninstall-hooks`** — integrations; run `--help`
  for specifics if the user asks.

## Notes for Claude

- **Destructive commands** — `close-window`, `close-workspace`,
  `close-surface`, and tmux's `kill-*` equivalents end sessions and lose
  unsaved buffers. Confirm before running on the user's behalf.
- **Arbitrary execution** — `cmux send` / `send-key` / `send-panel` and
  `browser eval` execute text in another surface or page. The receiver's
  shell or page will run it. Confirm content and target before sending,
  especially with `\n` (auto-Enter).
- **Socket auth** — `--password` > `CMUX_SOCKET_PASSWORD` env > saved
  password. Don't echo passwords into logs.
- **Defaults inside cmux terminals** — most commands implicitly target the
  current workspace/surface via `$CMUX_WORKSPACE_ID` / `$CMUX_SURFACE_ID`.
  Outside a cmux terminal you must pass `--workspace` / `--surface`
  explicitly, or first call `cmux current-workspace` / `list-panes` to
  discover refs.
- **Discovering ids** — `cmux tree --all` is the fastest overview;
  `cmux list-pane-surfaces --id-format both` gives refs + UUIDs together.
- **When unsure, run `--help`.** This file summarizes; the binary is
  authoritative. Do not invent flags.
- When opening a new workspace for the user, prefer `--cwd $PWD` so it
  inherits the current directory unless they specify otherwise.
