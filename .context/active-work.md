---
type: active-work
project: wisp
updated: 2026-09-18
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-18 by GPT-6 Astra / Codex (auto)_
_Release commit: `d0a411a74eb9d260d213a8f81ffbd1b1dd7145fd` (v2.2.0)._

## Current focus

Wisp 2.2.0 is published and installed, with companion VSIX 1.14.0. PR223 merged; release CI35228363121 passed four native builds and publication. No remaining release task. These facts supersede candidate-only and desktop-failure batons.

## State

- **Done:** user-confirmed repaired Grok desktop text/follow-up/tool execution, lag gone; combined native/restart/sign-in checklist user-reported passed. Other external providers are not individually desktop-verified.
- **Verified:** fresh core1232/TUI126, types/VSIXcompile, both actual CLI0.154 synthetic signed checks; independent final release review. All five downloaded public assets match GitHub SHA256; all four binaries match tag CI. npm shell/all four platform manifests available2.2.0; downloaded Windows npm binary matches standalone; packaged checks pass.
- **Installed:** npm2.2.0; VSIX1.14.0. Installed binary and extension bundle match downloaded release. Reload VS Code to activate the new extension host; installed extension-host behavior remains unverified.
- **Live Bridge:** owned shell787e24bf-1023-4f5e-aee9-e26ee1f4c81f now runs installed npm platform binary, not candidate. Port41184, integration enabled. No auto-start service; after reboot user runs `wisp serve` and keeps it running.
- **Preserved:** Wisp config/auth and Codex config/auth identical across install and host switch. Original earlier baseline Codex config changed concurrently before install; preserved latest instead of restoring. Existing Grok4.6(Wisp) Alias retained; `my-grok` was only an example and never created by agent.

## Pick up here

No active release work. For verification/rollback details read `D:/wisp-release-2.2.0-20260918/verification.json`, `verification-commands.json`, `immediate-before-install.json`, `after-handoff.json` and epic artifact `autobuild/wisp-desktop/release-220/index.md`. Public release: https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.2.0.

If adding supported aliases, use existing routing commands then `wisp codex-desktop refresh` and restart desktop. Antigravity remains excluded; renaming an Alias cannot bypass it. Preserve exact routes, credentials and current effort/preferences. No need to rerun enable or old diagnostic trials.

## Skills for next session

- preset pick-up; verification-before-completion for follow-up verification.
- systematic-debugging only for a new reproduced failure.

## Open questions

None blocking release. Installed VS Code host and Traycer GUI Alias support remain separate/unverified.

## Recent context

- User explicitly authorized release/publication and installed-copy upgrade; did not request auto-start service.
- Existing workflow rerun hazard: a pre-existing release bypasses asset validation. This was a fresh release; never rerun publication on an existing release without checking exact assets. Independent review at epic release-final-review.
- Main checkout was not pulled/reset because it contains user-owned context edits. Application source is on origin/main and v2.2.0; preserve main .context/flows.md and Untitled.canvas. All worktrees and previous candidate evidence retained.
- Computer-use guidance prohibits automating ChatGPT desktop UI; UI acceptance was supplied by user, not inferred from synthetic checks.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[release-follow-ups]]
