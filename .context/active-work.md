---
type: active-work
project: wisp
updated: 2026-09-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-17 by GPT-6 Astra / Codex (auto)_
_Application source unchanged from `7ccf06d`; this session adds investigation/handoff documentation._

## Current focus

The user wants routed models visible beside native choices in the OpenAI desktop picker while retaining ChatGPT sign-in. They supplied a creator screenshot and `duolahypercho/codex-router`, authorizing unattended investigation. Research and an isolated native protocol proof are complete; Wisp desktop implementation and activation are not done.

## State

- **Done:** [combined investigation](../docs/investigations/codex-desktop-signed-in-routing.md), pinned reference source audit, and a passing synthetic `account/read` -> `model/list` -> external-model turn experiment on installed CLI 0.154.0.
- **Finding:** Wisp's child-only catalog is not supplied to independently launched Desktop. Its keyed provider mode reports no account even when an auth document exists. A signed provider retains the synthetic ChatGPT account and still exposes/executes the external Alias.
- **Observed installed versions:** npm Wisp 2.1.5, Codex CLI 0.154.0, Windows Store OpenAI.Codex 26.908.9136.0. Earlier non-installation statements are historical. Running Bridge ownership and installed VS Code version were not re-established.
- **Unverified:** actual desktop picker/restart/persistence, real provider turns, signed Wisp Bridge auth, and native OpenAI passthrough. Direct execution of the Store bundled CLI returned Access is denied; no policy changes were attempted.
- **In flight:** none. No live app/config/auth edit, provider request, installation or restart was performed.

## Pick up here

For implementation, read the combined investigation's proposed follow-up. Settle local-hop authentication and native/external routing before edits, reuse Wisp's Bridge/catalog, preserve the current exact model routes, and require desktop acceptance plus rollback. Do not install the full codex-router stack merely to obtain its picker mechanism.

Evidence:

- `D:/codex-router-research-20260917/RESEARCH-NOTES.md` - independent source audit at `63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c` (0.6.0); reference tests were read, not run.
- `D:/wisp-codex-desktop-investigation-20260917/probe.py` and `results.json` - runnable stdlib probe, synthetic homes and local endpoint; CLI version/path and scope recorded. Live Codex/Wisp config/auth hashes remained unchanged during checks.

## Skills for next session

- `preset pick-up` - resume this exact context.
- `openai-docs` and `systematic-debugging` - verify the actual desktop build and configuration behavior.
- `brainstorming` / `traycer-tech-plan` - settle the signed transport/configuration contract if implementing.
- `test-driven-development` and `verification-before-completion` - credential separation, native/external routing, configuration rollback and desktop acceptance.

## Open questions

The report proposes Wisp integration; local bearer matching versus a separate capability has not been selected. Account/profile switching and exact desktop behavior need investigation. The research request is complete without activating either router.

## Recent context

- The user delegated the investigation while away. Preserve the goal of a normal signed-in picker; neither a CLI-only list nor logging out satisfies it.
- Live Wisp has a `custom model` Alias and exact routes including `gpt-5.5` -> `xai/grok-4.6`. Preserve explicit user overrides when defining native fallback.
- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` out of unrelated commits.
- Traycer Alias integration remains separately NOT VERIFIED; see `docs/investigations/traycer-codex-compatibility.md`.
- Wisp 2.1.5 / VSIX 1.13.8 release and #215-#218 remain complete. Published evidence stays at `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-215-codex-picker-aliases/out/release-2.1.5-published/` (`metadata.json`, `verification.json`, `verify.py`, `native-check.py`). No publication step remains. Global Bun, credentials, TLS, permissions and Slot were preserved.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[release-follow-ups]]
