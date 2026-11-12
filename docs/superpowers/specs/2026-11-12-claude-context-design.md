# Exact context budgets for claude-wisp

Approved by khitarashi on 2026-11-12: proceed with exact-size support through the Wisp launcher, safe switching between different limits, and CodeRabbit review. Subsequently requested updating Wisp's Anthropic client stamp to the verified installed Claude Code 2.1.322.

The launcher must configure Claude Code's context capacity from the selected Wisp Target, including 128K, 400K, 500K and 1M. Discovery alone cannot carry this information. Native verification and the rejected alternatives are recorded in `docs/investigations/claude-alias-context-official-docs.md`.

## Approach

Use a child-only numeric context override and a synthetic model identity that Claude Code treats as an unknown provider spelling. The Bridge provides an authenticated, signed context profile for one route and target. A request carrying that profile may reach only that selected target; invalid profiles, alternate models and changed routes fail before provider generation. No shared settings or stored alias names change.

The first version locks the selected target for a launch. A user switches by exiting and running `claude-wisp --resume <session> --model <alias>`. Inherited-model subagents work; explicitly different subagent/fallback targets are refused. This is a safe refusal policy, not an automatic restart manager. Server-side advisor requests retain their existing separate route.

With `--model`, resolve an existing Wisp Alias, Provider or configured Claude family route. Without it, use the Active Provider. Resume/continue require an explicit model to avoid silently choosing a different target. Unknown capacity uses a clearly reported conservative 128000-token budget; known capacity comes from account metadata or existing curated/public metadata, never a guessed new model family. Preserve normal Claude permission/settings options, and reject conflicting transport/context overrides instead of silently weakening the contract.

## Alternatives

Automatic `[1m]` discovery handles only one size. A global override without route enforcement becomes wrong on model switches. Per-model compaction settings do not change capacity. Internal signed catalogs are not a supported arbitrary-model configuration interface. The launcher with enforced target identity covers exact sizes without pretending any of those mechanisms is sufficient.

## Acceptance and limits

- Both Bridge hosts implement the same profile endpoint and enforcement.
- Launch fails clearly against an older Bridge/client; qualify installed Claude Code 2.1.322.
- Context reads are bounded. Profiles identify the pinned model, base URL and metadata source; signed data contains no provider credentials.
- Existing ordinary Bridge requests keep their current behavior. Synthetic IDs without their profile never fall through to the Active Provider.
- Model selection, resume, unknown metadata, route edits, malformed profiles, argument/settings conflicts and concurrent different-sized launches receive regression coverage.
- Native loopback probes show exact budgets, normal request routing and rejection before upstream on a changed target. They do not claim full-window provider qualification.
- Update the Anthropic User-Agent and billing-version stamp together to 2.1.322. Keep beta selection and all other fingerprint fields unchanged.
- Primary checkout only; preserve pre-existing `.context/flows.md`. No publication, installation, real-client restart, credential change or permissions change.
- CodeRabbit checkpoint `claude-context-windows`: three launches maximum, no paid escalation; prior release checkpoints remain closed.
