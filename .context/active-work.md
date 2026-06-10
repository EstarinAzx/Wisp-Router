---
type: active-work
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-10 by Opus 4.8 (background)_
_At commit: uncommitted (initial commit being created)_

## Current focus
Phase-1 inline-completion extension is built and compiles. The next feature — a Preact + Tailwind v4 side panel for API key + model + on/off — is planned and PRD'd but **not yet implemented**.

## State
- **In flight:** nothing mid-edit. Side panel is queued, not started.
- **Done this session:** working extension (`package.json`, `tsconfig.json`, `src/extension.ts`, `README.md`, ignores) — `npm run compile` exits 0; `PRD.md`; this `.context/`; an approved side-panel implementation plan.
- **Blocked:** nothing.

## Pick up here
Implement the side panel. The full spec is in `PRD.md`; the step-by-step file plan is at `C:\Users\S.D\.claude\plans\soft-honking-mitten.md` (read it first — it lists every new/modified file). Order: refactor shared helpers out of the command handlers in `src/extension.ts` → add `src/sidePanelProvider.ts` → scaffold `webview/` (Preact + Tailwind v4 + Vite) → wire `package.json` (`viewsContainers` + `views` + scripts + dev deps) → `media/` icon. Verify per the plan's checklist (F5, key set/clear, model live-list + manual, toggle sync, no CSP violations).

## Skills for next session
- /executing-plans — there is an approved written plan to execute.
- /tdd — PRD marks M1 (suggestion cleanup) + M2 (completion context) for unit tests; write them red-green.

## Open questions
None blocking.

## Recent context
- Whole design was settled via a decision-by-decision review — see [[decisions]] (9 inline-completion decisions + 6 side-panel ones). Don't re-litigate.
- Reference provider studied: user's `llm-provider` (OpenAI SDK → `https://opencode.ai/zen/go/v1`) and the `codebuff` repo (same wire contract). Zen is OpenAI-compatible, Bearer auth, **no FIM**.
- Default model `opencode/minimax-m3` is unproven for code quality — use the latency log + `listModels` to compare against `glm-5`/`kimi-k2.6` on first real run.

## Related
- [[overview]]
- [[api]]
- [[decisions]]
- [[gotchas]]
