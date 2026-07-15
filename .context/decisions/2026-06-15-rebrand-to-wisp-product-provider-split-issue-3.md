---
type: decision
project: wisp
updated: 2026-06-15
tags: [context, decisions]
---

# Rebrand to Wisp; product / provider split (Issue 3)

**Decision:** The **product** is now **Wisp** — everything user-visible and every product identifier
renamed from `opencodeAutocomplete` / "OpenCode (Zen) Autocomplete" to `wisp` / "Wisp": package
`name`/`displayName`, the `wisp.*` namespace for command **and** setting ids, the SecretStorage key
(`opencodeAutocomplete.apiKey` → `wisp.apiKey`), the activity-bar container + webview view ids/titles,
the `WispPanelProvider` class, status-bar text, output-channel name, all `Wisp: …` toast/progress
strings, the README, and the icon (`media/opencode.svg` → `media/wisp.svg`). Version bumped 0.0.4 →
0.0.5. The **provider** keeps its own name, **OpenCode Zen**: `DEFAULT_BASE_URL`
(`https://opencode.ai/zen/go/v1`), the `OPENCODE_API_KEY` env fallback, the "OpenCode Zen provider"
wording in the `baseUrl` setting, and the `opencode/`-prefix discussion all stay. Pure rename — **no
behavior change**. See `CONTEXT.md` ("Product and provider") for the vocabulary.
**Why:** give the product its own identity, separate from any one provider, so additional providers can
be added later (a future issue) without another rename. **Wisp** = the product; **OpenCode Zen** = the
(current, first) provider — the product *has* a provider.
**Breaking:** the setting namespace and the SecretStorage key both moved, so any previously stored key
is orphaned — the user re-enters it once via **Wisp: Set API Key**. Acceptable for a pre-release (0.0.x).
**Reversibility:** easy mechanically, but don't — the split is the point. Multi-provider support builds on it.
**Out of scope (future issues):** multi-provider architecture, provider-switching UI, logo redesign (the
glyph was reused, only its filename changed).

## Related

- [[decisions]] — index
