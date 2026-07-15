---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Bridge #38 built: panel control + generated secret + COPILOT_* env injection

**Decision:** Shipped slice #38 — the side-panel Bridge control, the real access secret, and the #35 env
injection, all in the three existing files (`extension.ts`, `sidePanelProvider.ts`, `webview/app.tsx`); no
`package.json` change (the `wisp.bridgeToggle` command + `wisp.bridge.port` setting already existed from #37).
- **Secret:** the #37 temp constant `BRIDGE_ACCESS_SECRET` is gone. `ensureBridgeSecret()` generates a
  `randomBytes(32)` base64url secret **once**, stores it in SecretStorage slot **`wisp.bridge.secret`**, and
  reuses it thereafter (so a configured CLI keeps working across restarts — never regenerated each start). The
  listener reads it via `accessSecret: () => bridgeSecret`, a module var materialized on start and reset to
  `''` on stop (the listener's auth check is synchronous, so it can't `await` SecretStorage per request).
- **One shared lifecycle, no fork:** `startBridge`/`stopBridge` are the single start/stop path; the palette
  command and the panel switch both call them. `getState` exposes `bridgeRunning`/`bridgeAddress`/
  `bridgeSecret` (secret only while running), and `bridgeToggle` pushes panel state after either trigger.
- **Secret crosses the webview boundary, deliberately.** Unlike Provider keys (write-only across the boundary),
  the Bridge secret is *shown* (as `type="password"`) with a Copy button while running — it's the Bridge's own
  localhost secret and the user must copy it into the CLI. Copy is done **host-side** (`vscode.env.clipboard`),
  since webview clipboard access is restricted. Consistent with the PRD's accepted localhost-secret posture.

**The #35 env injection lands here (path (a) from the env-var decision above):** `injectCopilotEnv()` does
`context.environmentVariableCollection.replace(...)` for the five `COPILOT_*` BYOK vars on start; `clear()` on
stop. Two non-obvious calls worth recording:
- **`clear()` on activate too, not only on stop.** The collection is `.persistent` by default, so VS Code
  re-applies the previous session's vars on a window reload — but the Bridge always starts OFF, so without an
  activate-time clear a new terminal would inherit a dead-port `BASE_URL` + a stale `API_KEY` while nothing is
  listening. (Closes the gap the original env-var decision's "clear on off" left open across reloads.)
- **`COPILOT_MODEL` re-synced on a mid-run Provider switch** (the `onDidChangeConfiguration` handler, guarded
  by `bridge.isRunning()`) so the panel's choice stays the single source of truth (story 8). Only that one var
  — `BASE_URL` stays bound to the running listener's port, not the (possibly newly-edited) `bridge.port`.

**Known ceiling (accepted, not fixed):** `bridge.stop()`'s `server.close()` is async, so a fast stop→start
(panel double-click) can hit `EADDRINUSE` before the OS frees the port. It self-heals (error toast + retry once
freed); a `ponytail:` comment in `stopBridge` names the upgrade path (gate the toggle on a transition flag) if
it ever bites. Surfaced by the `cavecrew-reviewer` pass, which also confirmed: no empty-secret bypass
(`randomBytes` never empty + listener unbound when secret is `''`), no secret leak on the failed-start path
(`getState` gates display on `isRunning()`), double-start guarded.

**Verification:** `tsc` clean; **234 tests still green** (panel/secret/env are glue → F5-verified, not
unit-tested, per the PRD); **live F5 smoke** — panel Start → an `Invoke-RestMethod` non-stream `POST` returned
a real `chat.completion` through `opencode-go`. **Still pending:** the real Copilot-CLI-in-a-terminal confirm
(the last unproven half of #35) — curl/`Invoke-RestMethod` proved the listener, not yet a CLI session.
**Unblocks #39** (Codex send-path) and #40 (Anthropic).
**Reversibility:** easy/additive — edits to three files; revert to restore #37's constant-secret state. No ADR.

## Related

- [[decisions]] — index
