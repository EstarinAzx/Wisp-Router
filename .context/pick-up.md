---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE + CLOSED): #150 — bootstrap account identity + `metadata.user_id`.**

- Merged to `main` via PR #154 (merge `8f2ebf2`). 622 tests green (17 new), vscode
  compile + TUI typecheck clean. Touched: core `anthropic.ts` / `anthropicAuth.ts` /
  `anthropicClient.ts` / `home.ts` + tests, TUI `providerScreens.tsx`, vscode
  `extension.ts` / `sidePanelProvider.ts` / webview `app.tsx`.
- **Live-verified + closed:** real `/signin` filled the auth slice (real
  `account_uuid`, email, `default_claude_max_5x`; TUI shows `you@email · Max 5x`), and a
  post-merge haiku turn through `anthropicClient` was accepted with the new
  `metadata.user_id` body (no 429). Breadcrumb on #150.
- Decision recorded: [[2026-07-21-session-id-per-process-metadata-identity]]
  — session_id stays per-process; identity rides on `AnthropicCreds`.

**Next task: #151 — shape-aware `anthropic-beta` 4→12 (`ready-for-agent`).**

- `gh issue view 151 --comments` for the token list. The header lives at
  `ANTHROPIC_BETA` in `packages/core/src/anthropicClient.ts`; some tokens are
  request-shape conditional (that's the "shape-aware" part).
- After #151: #152 (cache-diagnosis probe, `ready-for-human` — probe first), then close
  umbrella #148. #126 is probably closable as fully shipped.

**Landmines:**

- Refresh/sign-out must keep the creds identity fields — `refreshIfNeeded` carries
  non-token fields via destructure-rest, sign-out keeps `deviceId`. Don't regress when
  touching `anthropicAuth.ts`.
- Keep `cc_entrypoint=cli` + UA suffix `(external, cli)`; fingerprint hash is
  UNVALIDATED — don't reproduce claude's real algorithm.
- Verify wire changes live: cheap path = scratchpad bun script calling
  `anthropicStream` with stored creds (one haiku turn); byte-level path = the
  `ANTHROPIC_BASE_URL` capture listener. See active-work Recent context.
- Prior #145 landmines still hold (see [[active-work]] Recent context).

## Related

- [[active-work]]
- [[overview]]
- [[2026-07-21-session-id-per-process-metadata-identity]]
