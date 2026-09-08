---
type: pick-up
project: wisp
updated: 2026-09-08
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Wisp terminal/npm 2.1.4 and Wisp VSIX 1.13.7 are published and verified.** [Release](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.1.4), source `d3fcca682acc3d8e300ba414204977422e66ecca`, workflow `34180770927` passed all five jobs. Exact npm metadata and latest tag confirm 2.1.4.

The implementation queue is empty and its relay is stopped. No further release action is needed. **Installation was not requested:** installed Wisp 2.1.3 and extension 1.13.6 remain unchanged. Install/update only on user instruction.

## Next action, if requested

Use published downloads in `out/release-2.1.4-published/` (not the earlier local candidates). GitHub SHA-256 digests and npm SHA-512 integrity are checked; the published Windows/npm launcher passed smoke and native custom/discovery checks. Detailed evidence and paths are in [[active-work]].

## Landmines

- Preserve user-owned `.context/flows.md` and `.context/Untitled.canvas`. Stage only explicit context paths.
- Check running Bridge ownership before any update/restart; publication did not replace a loaded process.
- Native/live-provider acceptance remains limited to the recorded mock checks; four-platform CI validates compiled build/dispatch, not native Codex sessions on macOS/Linux.
- Saved bearer 401 and Node TLS-chain trouble are separate held concerns. Preserve credentials and TLS settings.
- Slot plugin is unchanged. Extension 1.13.7 is a GitHub VSIX; Marketplace publication was not performed.

## Related

- [[active-work]]
- [[overview]]
- [[release-follow-ups]]
