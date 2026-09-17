---
type: pick-up
project: wisp
updated: 2026-09-17
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Codex desktop routing research is complete; implementation is not started.** The user wants Wisp models beside native desktop choices while staying signed in, and supplied `duolahypercho/codex-router` as a reference. Read `docs/investigations/codex-desktop-signed-in-routing.md` for the pinned source audit and fresh isolated proof.

CLI 0.154.0 was tested with synthetic auth: Wisp-style `requires_openai_auth=false` reports no account; `true` retains the ChatGPT account. Both list native + external rows and complete a local external-model turn. Desktop UI and real providers remain unverified. Wisp 2.1.5 is now installed; the older installation note was stale. This session changed no live configuration/authentication or installed application.

## Next action

If continuing into implementation, start from the proposed signed-in desktop integration scope in the report: durable catalog, signed local transport, native/external credential separation, preservation of existing exact routes, and reversible config activation. The source audit found no need to install the full reference router. Local-hop authentication choice is still open; do not treat the proposal as an approved design.

## Landmines

- Direct execution of the Store desktop's bundled CLI returned Access is denied; the probe used the separately installed CLI. Preserve that evidence boundary.
- The current Wisp map explicitly routes `gpt-5.5` to xAI. Preserve user routes; native labels alone do not prove native OpenAI routing.
- Traycer GUI Alias integration remains NOT VERIFIED and separate from OpenAI desktop support.
- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` out of unrelated commits. Preserve retained worktrees/release evidence.
- #215–#218 and their release relay remain complete. No release/publication task is pending. Bun 1.4.2 remains the source/native test baseline; no global runtime change was made.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
