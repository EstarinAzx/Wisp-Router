---
type: decision
project: wisp
updated: 2026-06-17
tags: [context, decisions]
---

# Scope pivot: remove Completion, evolve Inquire into an inline-chat editor

**Decision:** Deprecate **Completion** (the always-on, `enabled`-gated ghost-text autocomplete) and
evolve **Inquire** from a ghost-text Suggestion into a VS Code inline-chat-style **editor**: an
instruction typed in a quick `showInputBox`, the selection (or current line) as the **target span**,
the whole file as context, and the model's rewrite applied as a `WorkspaceEdit` replace that can add
**and** delete lines, reviewed via accept/reject. Planned as 4 tracer slices (PRD **#3**; **#4** evolve
Inquire B1 → **#5** remove Completion → **#6** inline diff B2 → **#7** bonus LM-provider). Design spec:
`docs/superpowers/specs/2026-06-17-inline-chat-pivot-design.md`.

**Why:** ghost text can only insert at the caret — it can never delete/rewrite; the user wants full
add+delete control driven by an explicit prompt. Three constraints fixed the shape:
- The **native Ctrl+I inline-chat widget is a proposed API** → unpublishable to the Marketplace. So we
  build our own on **stable APIs** (`showInputBox` + `WorkspaceEdit` + `needsConfirmation` refactor-preview
  for B1; `setDecorations` + `CodeLens` for the in-editor diff in B2). Prompt entry is a top-center input
  box, **not** a floating in-editor widget (impossible on stable APIs).
- **Inference stays on Wisp's own OpenAI-compatible client**, independent of `vscode.lm` and GitHub
  Copilot — keeps Wisp provider-agnostic and its own product, not a Copilot model plug-in.
- **Slice order is forced by entanglement:** Inquire has no output surface of its own — it stashes a
  `pendingInquiry` the Completion `InlineCompletionItemProvider` returns via an early-return. Inquire must
  get its own edit path (#4) **before** the provider is removed (#5), or #4 breaks. See [[gotchas]].
- **Option A** (register as a VS Code Language Model Chat Provider so Wisp models appear in *native* inline
  chat) is a **deferred, optional bonus (#7), HITL** — its BYOK gating is unresolved (may need Copilot
  Business/Enterprise as of Apr 2026 vs docs saying no Copilot plan needed). Never the core.

**Reversibility:** the product **direction** is a hard pivot (one-way once Completion code is deleted in
#5). But as of this session nothing destructive is committed — only the spec + issues exist on branch
`feat/inline-chat-pivot`; trivially reversible until #5 lands.

## Related

- [[decisions]] — index
