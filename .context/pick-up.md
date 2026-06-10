---
type: pick-up
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-10):** built and verified the phase-1 inline-completion extension (`src/extension.ts` compiles clean), wrote `PRD.md`, and got an implementation plan approved for the side panel.

**Next task:** implement the **Preact + Tailwind v4 side panel** (API key + model picker + on/off toggle).
- Spec: `PRD.md`. File-by-file plan: `C:\Users\S.D\.claude\plans\soft-honking-mitten.md` — read it first.
- Reuse the existing `secrets` / `cfg()` / `getClient()` / `renderStatus()` in `src/extension.ts`; extract shared helpers so the panel and the existing commands stay in sync.

**Landmines (see [[gotchas]]):**
- Keep the webview on its **own** tsconfig — don't let the extension `tsc` compile JSX.
- Pin Vite output to unhashed `dist/webview/main.js` + `main.css` (extension references them by fixed path).
- Webview key is **write-only** — never post the key value back, only `keyIsSet`.
- Strict CSP (script nonce + `cspSource` styles); add `'unsafe-inline'` only if the webview console complains.

Full rolling state in [[active-work]]; settled choices in [[decisions]].
