# Inline-Chat Pivot — Design Spec

**Date:** 2026-06-17
**Status:** Approved (brainstorming), pending implementation plan
**Project:** wisp

## Summary

In the project's ubiquitous language (`CONTEXT.md`), this is **remove Completion,
evolve Inquire**:

- **Completion** — the automatic ghost text that fires while typing, gated by the
  **enabled** toggle ("the autocomplete you tick to enable") — is **removed**.
- **Inquire** — the manual trigger (`wisp.inquire`) — is **evolved** from
  "selection-as-prompt → ghost-text Suggestion" into a **VS Code inline-chat-style
  edit**: the user invokes the command, types a natural-language **instruction**
  in a quick input box, and the AI returns code edits that **add and delete**
  lines over the **target span** (not insert-only ghost text), reviewed via an
  accept/reject diff in the editor.

**Entanglement note (drives slice order):** Inquire today has no output surface of
its own — it stashes a `pendingInquiry` and the **Completion**
`InlineCompletionItemProvider` returns it via an early-return. So Inquire
piggybacks on the very provider being removed. Inquire must therefore get its own
edit path **before** Completion can be ripped.

The entire backend pipe is reused — the Provider catalog, the OpenAI-compatible
client, per-Provider key/model management, and the side panel. Only the
**trigger** (explicit command instead of on-keystroke) and the **output
handling** (apply-edit + diff instead of ghost text) change.

## Motivation

Wisp today is *only* the ghost-text `InlineCompletionItemProvider`. Everything
else (catalog, side panel, keys) exists to feed that one completion path. The
product is evolving so that the AI has **full control to add and delete code in
the script**, driven by an explicit prompt — the experience of VS Code's native
Ctrl+I "Generate code" inline chat — rather than passive ghost-text suggestions.

## Constraints (from research)

- The **native inline-chat widget** (the floating input box rendered *inside*
  the editor at the cursor) is driven by a **proposed API** and **cannot be
  shipped to the Marketplace**. We cannot reproduce that exact floating widget.
- Wisp brings its **own OpenAI-compatible HTTP client** (custom base URLs +
  keys). It does **not** use VS Code's model registry (`vscode.lm`) for the core
  feature, so it is independent of GitHub Copilot for inference.
- Therefore the prompt entry uses a **stable quick input box** (`showInputBox`,
  top-center), and the diff/accept-reject happens **in the editor** via stable
  APIs. This was a chosen tradeoff: prompt entry is not literally at the cursor
  line, but the edit + diff are in-editor.

Stable APIs this design relies on (all publishable):
`window.showInputBox`, `vscode.WorkspaceEdit` + `workspace.applyEdit`,
`WorkspaceEditEntryMetadata.needsConfirmation` (native Refactor Preview),
`TextEditor.setDecorations`, `CodeLens`. The bonus phase uses the now-stable
`vscode.lm.registerLanguageModelChatProvider`.

## Architecture

### Stays (reused, untouched or lightly repurposed)

- `src/catalog.ts` — Provider catalog + `resolveModel` / `resolveBaseUrl` /
  `planLegacyMigration`. Unchanged (new pure helpers are *added* here).
- `getClient()` cached OpenAI instance, Active-Provider switching, key
  management (SecretStorage + `OPENCODE_API_KEY` env fallback).
- The side panel's provider / key / model UI.
- Status bar + `enterInFlight` / `exitInFlight`, repurposed to show "Wisp
  thinking" during an edit request; the `Wisp` output channel latency log.
- `stripThink` + `stripFences` — still needed to unwrap `<think>` blocks and
  ```` ``` ```` fences from the model's edit reply.

### Goes (ghost-text-specific, removed)

- The `vscode.InlineCompletionItemProvider` object and its
  `registerInlineCompletionItemProvider` registration.
- Keystroke gating, the single-entry cache, debounce-via-cancellation-token,
  `buildContext` (prefix/suffix), `buildInquiryContent`.
- `stripPrefixOverlap` + `relocateAfterComment` (only meaningful for ghost text).
- The **enabled toggle**: `wisp.toggle`, `setEnabled`, the panel's enabled
  checkbox, and any `wisp.debounceMs` setting. Inline chat is explicit-invoke —
  there is nothing to gate. This trims `getState`'s shape and the webview
  reducer (contained but real changes to `sidePanelProvider.ts` and
  `webview/app.tsx`).

### The inline-chat loop

The **existing** `wisp.inquire` command is evolved in place (kept in the
`editor/context` menu + palette), plus a contributed (rebindable) keybinding
**`Ctrl+Shift+I`** — `Ctrl+I` is taken by built-in Copilot inline chat as of
VS Code 1.116.

```
active editor + selection (or current line if no selection)
  → showInputBox  →  user instruction ("make findBy reject a null predicate")
  → buildEditPrompt({ selectionText, instruction, languageId, context })   [pure, catalog.ts]
  → enterInFlight (status bar "thinking", panel activity ping)
  → getClient().chat.completions.create(...)        // existing Active-Provider client, non-streaming
  → stripThink → stripFences  →  replacement text   [reused cleaners]
  → exitInFlight + latency log
  → apply replacement over the targeted span  →  accept/reject (see Diff UX)
```

The model is asked to return the **rewritten code for the targeted span**.
Original span + new text → a single replace edit, which covers both add (new
text longer) and delete (shorter). No selection → target the current line;
widening to whole-function is a later enhancement, out of scope here.

## Diff UX (two flavors, shipped in order)

Both end in the same `WorkspaceEdit` replace; they differ only in review.

- **B1 — native Refactor Preview (first).** Build the replace edit with
  `WorkspaceEditEntryMetadata { needsConfirmation: true }`, then `applyEdit`.
  VS Code shows its built-in refactor-preview diff with per-change checkboxes;
  `applyEdit` resolves to whether the user accepted. Zero custom diff UI; review
  is a side pane.
- **B2 — in-editor inline diff (upgrade).** Compute a line diff between the
  original span and the model's new text → `setDecorations` (added lines green,
  removed lines strikethrough/red) in the editor, plus a `CodeLens`
  "✓ Accept / ✗ Reject" pair on the span. Accept → apply the `WorkspaceEdit`;
  Reject → clear decorations, no change. This is the native-feel target.

## Pure logic to TDD into `catalog.ts`

Per the project pattern (vscode-free, unit-tested via `npm test`):

- `buildEditPrompt({ selectionText, instruction, languageId, context })` → the
  messages array sent to the model.
- `extractEditText(raw)` → fence/think-stripped replacement (composes the
  existing strippers).
- `diffLines(original, next)` → added/removed line ranges (B2's highest-value
  test target).

vscode-coupled glue (resolve span from selection, paint decorations, register
CodeLens) stays in `extension.ts` and delegates to these pure cores.

## Slicing (tracer bullets)

Matches the `issues.md` vertical-slice convention. Each slice compiles,
F5-loads, and ships something working.

1. **Evolve Inquire → inline-edit (B1).** Give `wisp.inquire` its own output
   path: input box (instruction) → `buildEditPrompt` → existing client →
   `extractEditText` → `WorkspaceEdit` replace over the target span with
   `needsConfirmation` → native preview accept/reject. Inquire stops stashing
   `pendingInquiry`/touching the provider. **Completion still runs, untouched.**
   First working inline edit, end-to-end.
2. **Remove Completion.** Now the `InlineCompletionItemProvider` has no other
   user — rip it + the `enabled` toggle (`wisp.toggle`/`setEnabled`) +
   debounce/cache/gating + the now-dead `pendingInquiry` stash + Completion-only
   settings (`debounceMs`/`maxPrefixChars`/`maxSuffixChars`) + the panel
   enabled-checkbox/Muted dressing + status-bar `disabled`/`ready`-vs-enabled
   logic. Prune `getState`/webview shape. Update `CONTEXT.md` (retire
   **Completion**/**Suggestion**/**enabled**/**Muted**/**selection-as-prompt**,
   redefine **Inquire**). `npm test` green. *Wisp = Inquire-only.*
3. **Inline diff (B2).** Swap Inquire's native preview for in-editor decorations
   + CodeLens accept/reject. `diffLines` pure + TDD'd.
4. **Bonus (optional, deferred): Option A — native inline-chat surface.**
   Register Wisp via `registerLanguageModelChatProvider` so the same Provider
   models appear in VS Code's *native* inline chat too. **Caveat:** BYOK models
   may require Copilot Business/Enterprise on the GitHub side (as of Apr 2026);
   verify gating against the target VS Code version before relying on it. Pure
   extra surface — never the core, and explicitly not committed in this spec.

## Testing & verification

- **Unit (Vitest, `npm test`):** the three pure cores — `buildEditPrompt`,
  `extractEditText`, `diffLines`. Boundaries: empty selection, fenced vs bare
  reply, `<think>` wrapper, no-op edit (new == original), pure-insert and
  pure-delete diffs.
- **Compile gate:** `npm run compile` clean (extension + webview + vite) each
  slice.
- **Manual F5 (per slice):**
  - Slice 1 — panel switches providers, no completions, no errors.
  - Slice 2 — select code → `Ctrl+Shift+I` → instruction → preview → accept
    mutates buffer / reject leaves it untouched.
  - Slice 3 — inline decorations + CodeLens behave; accept applies, reject
    clears.

## Out of scope

- Streaming the edit token-by-token (non-streaming first).
- Multi-span / multi-file edits in one prompt.
- Whole-function or smart-range target selection (current line / selection only).
- Conversational chat history (each invocation is one-shot).
- Committing to Option A (documented as a deferred bonus only).

## Open questions / risks

- **Option A gating** is the softest fact — confirm BYOK/LM-provider gating
  against the minimum supported VS Code version before building phase 4.
- Model reply discipline: the prompt must reliably elicit *only* the rewritten
  span (no prose). `extractEditText` + prompt design mitigate; manual F5 will
  shake out provider-specific quirks.
