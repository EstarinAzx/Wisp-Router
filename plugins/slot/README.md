# wisp-slot

Claude Code plugin for sessions bridged through the [Wisp](https://github.com/EstarinAzx/Wisp-Router) Bridge.

## What it ships

- **`slot` skill** — the safe rebind→spawn→restore procedure for running a subagent on any Wisp Target through a temporarily rebound Claude family route. Supports **parallel Slots**: one family per distinct Target, up to 4 at once (`haiku`/`sonnet`/`opus`/`fable`), each with its own lease and independent restore.
- **SessionStart hook** — a bridged session announces it: routing awareness ("family names resolve through the Wisp Routing map"), a live family-route snapshot, the headless CLI cheat sheet (`wisp routing` / `wisp providers` / `wisp models <provider>`), and a warning listing any unrecovered per-family Slot leases (`~/.claude/slot/lease-<family>.json`). Sessions not bridged through Wisp get nothing.
- **Statusline badge** (opt-in wiring, see below) — `[WISP fable→gpt-5.6-terra]`: what the session's model *actually* resolves to right now, refreshed live so a mid-session Slot rebind is visible. `!LEASE` appears while a Slot lease is held (`!LEASE×N` for N concurrent leases). Falls back to `[WISP]` when resolution fails; absent when not bridged.

Bridged detection = `ANTHROPIC_BASE_URL` set **and** the Wisp home directory exists (`WISP_HOME` env override honored, default `~/.wisp`).

## Install

```
/plugin marketplace add EstarinAzx/Wisp-Router
/plugin install wisp-slot@wisp-router
```

The hook activates on its own. The badge needs one wiring step:

## Statusline wiring

Claude Code has a single `statusLine` command; the badge is a script yours calls. It reads the statusline stdin JSON, so pass stdin through.

POSIX shell statusline:

```sh
input=$(cat)
# ... your existing segments ...
printf '%s ' "$(echo "$input" | node "$HOME/.claude/plugins/marketplaces/wisp-router/plugins/slot/statusline/wisp-statusline.js")"
```

PowerShell statusline:

```powershell
$input_json = [Console]::In.ReadToEnd()
# ... your existing segments ...
$input_json | node "$HOME\.claude\plugins\marketplaces\wisp-router\plugins\slot\statusline\wisp-statusline.js"
[Console]::Write(" ")
```

Adjust the path if your marketplace install location differs. No statusline configured yet? Point `statusLine.command` in `~/.claude/settings.json` straight at the node call.
