---
type: decision
project: wisp
updated: 2026-06-24
tags: [context, decisions]
---

# Bridge #35: VS Code → Copilot CLI env-var passing (gate)

**Decision (YES — Wisp can, and should, inject the vars itself):** VS Code does **not** automatically push
custom env vars into a Copilot-CLI process spawned in its integrated terminal — a terminal inherits the
extension-host/VS Code process environment (plus the user's login-shell env and any
`terminal.integrated.env.<platform>` additions), and Wisp's BYOK vars are in none of those by default. The
**sanctioned, Wisp-owned path is the `EnvironmentVariableCollection` API**: from `extension.ts`, use
`context.environmentVariableCollection` (typed `GlobalEnvironmentVariableCollection`) and call `.replace(name, value)`
for each of the five Copilot BYOK vars. Every integrated terminal created **after** the collection is set
inherits them, so a Copilot CLI session started in a VS Code terminal is pointed at the Bridge with no user
setup. This is path **(a)** from the PRD; it wins because it's automatic and lives in the same extension
process that already owns the Bridge listener + secret.

**The five vars to inject (verified against current GitHub Copilot CLI BYOK docs, 2026-06-24):**
`COPILOT_PROVIDER_BASE_URL` (required — point at `http://127.0.0.1:<port>/v1`), `COPILOT_MODEL` (required — a
Wisp Provider id), `COPILOT_PROVIDER_API_KEY` (the Bridge access secret), `COPILOT_PROVIDER_TYPE` (`openai` —
the default; allowed `openai|azure|anthropic`), `COPILOT_OFFLINE=true` (skip GitHub's servers). All five are
read from the **process environment**; the CLI also requires the model to support **tool calling + streaming**
(Bridge already round-trips both). The PRD's names are **confirmed current**, not stale.

**Wiring (exact API):** `context.environmentVariableCollection.replace('COPILOT_PROVIDER_BASE_URL', url)`, …×5.
`replace` defaults to `{ applyAtProcessCreation: true }`. `.clear()` / `.delete(name)` to tear down when the
Bridge toggles off. `.persistent` defaults **true** → the vars survive window reloads (the collection is cached
and re-applied), so set it deliberately (likely keep true while the Bridge is on; clear on off). Set
`.description` so the user sees *why* the env changed in the terminal-tab hover. For a per-folder scope,
`environmentVariableCollection.getScoped({ workspaceFolder })` returns an isolated child collection applied
after the global one — **not needed for v1** (global is correct; the Bridge is machine-wide).

**Fallbacks (if the user prefers manual / for a terminal already open before the toggle):**
(b) user adds the five vars to `terminal.integrated.env.<platform>` in settings.json; (c) user exports them in
a shell and launches VS Code (or just the `copilot` process) from that shell. Both are documentation-only; (a)
is the default Wisp ships.

**Caveats (load-bearing):**
- **Applies to terminals created AFTER the collection is set.** A Copilot CLI session running in a terminal
  opened *before* Wisp set the vars will **not** see them — VS Code marks that terminal stale: per the Terminal
  Advanced docs, "If an extension changes the terminal environment, any existing terminals will be relaunched
  if it is safe to do so, otherwise a warning will show in the terminal status," with "A warning icon … next to
  the terminal tab when a relaunch is required" and a relaunch button in the hover. Setup docs must tell the
  user to **open a fresh terminal (or relaunch)** after enabling the Bridge.
- The injected `COPILOT_PROVIDER_API_KEY` becomes visible to any process in that terminal (it's the Bridge's
  own localhost secret — same local-proxy posture already accepted in the Bridge PRD, not a new exposure class).
- A Copilot session in an **external** terminal (outside VS Code) is out of this mechanism's reach → that user
  takes fallback (b)/(c). Matches the Bridge's "alive only while VS Code + Wisp run" tradeoff.

**Why:** the Bridge listener + access secret already live in the extension host; injecting the vars from the
same place is zero extra moving parts and needs no token porting or user copy-paste. Settings/shell paths put
the burden on the user and can drift from the live port/secret.

**Verdict derived from docs + the VS Code API (release/1.104, which Wisp already targets); live F5 round-trip
(start Copilot CLI in a VS Code terminal, confirm it reaches the Bridge) is the pending final confirmation.**
**Reversibility:** easy/additive — it's `replace`×5 on activate-or-toggle + `clear` on off; no ADR (consistent
with the Bridge PRD entry's "no ADR" call). Sources: VS Code `vscode.d.ts` (`EnvironmentVariableCollection`,
`GlobalEnvironmentVariableCollection.getScoped`, `ExtensionContext.environmentVariableCollection`); VS Code
Terminal Advanced docs (relaunch/stale-env indicator); GitHub Copilot CLI "Using your own LLM models" (BYOK) docs.

## Related

- [[decisions]] — index
