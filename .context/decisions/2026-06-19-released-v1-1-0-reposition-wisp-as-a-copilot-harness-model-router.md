---
type: decision
project: wisp
updated: 2026-06-19
tags: [context, decisions]
---

# Released v1.1.0; reposition Wisp as a Copilot-harness model router

**Decision:** Ship **v1.1.0** (the #12–#15 batch) and **reposition the product**: Wisp's primary framing is
now a **BYOK model router for VS Code's Copilot chat harness** — register your own backends (and your ChatGPT
subscription via Codex) as selectable models in native chat / Agent mode / Ctrl+I, with tool calling, vision,
and live caps. **Inquire is demoted to the secondary feature** (NOT removed — it still ships and routes
through the Active Provider). The README was rewritten router-first (drafted by a 4-agent panel workflow);
`package.json` description, `categories` (+`AI`,`Chat`), and `.context/overview.md`'s one-liner were
reframed to match. Version 1.0.0 → 1.1.0 (additive: Codex provider, Codex tool calling, Zen/Go split — no
breaking change). Tag `v1.1.0` → `568942c`; GitHub release with `wisp-1.1.0.vsix` attached (Latest).
`.vscodeignore` gained `.claude/**` + `docs/**` (vsix hygiene). Merged via PRs #17 (batch), #18 (release),
#19 (hygiene); issues #11–#15 closed.

**Why:** the LM Chat Provider surface (the native chat / agent harness, which is the Copilot Chat harness)
is the higher-leverage story — it turns the whole Copilot UI BYOK, whereas Inquire is one bespoke command.
The user directed the repositioning explicitly. Minor bump (not 2.0.0) because nothing user-facing breaks:
the Zen/Go id rename is handled by the existing migration, Codex is purely additive.

**Not done — Marketplace publish:** the extension is `publisher:"local"` + `private:true`, so it is **not**
on the VS Code Marketplace; the released artifact is the GitHub-release `.vsix` (install-from-VSIX). A real
publish needs a registered publisher + an Azure DevOps PAT (user-supplied) — `vsce login <publisher>` then
`vsce publish`. Build is otherwise release-ready.

**Reversibility:** the version/release/tag are permanent records (don't rewrite history). The *framing* is
soft — Inquire is intact, so re-emphasizing it later is just docs. Don't, however, re-describe the product
as "Inquire-first" in shipped docs without re-deciding; v1.1.0 chose router-first.

## Related

- [[decisions]] — index
