# Native Codex context: official documentation check

Checked 2026-09-18. Scope: exactly `gpt-6-astra`, public OpenAI documentation, read through a separate Traycer browser tab. No configuration changes or model requests were made.

## What the official pages establish

| Question | Documented fact | Source |
| --- | --- | --- |
| What is Astra's published API context? | `gpt-6-astra` has a **1,050,000-token context window** and **128,000 maximum output tokens**. These are distinct limits, not an assertion that every Codex client exposes 1,050,000 input tokens. | [GPT-6 Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra) |
| Does output consume context? | Reasoning occupies context and is billed as output. `max_output_tokens` limits generated reasoning, visible output, and non-visible formatting tokens. The guide advises leaving room for reasoning and output; it suggests an initial 25,000-token reserve for experimentation. | [Reasoning models: controlling costs and context](https://developers.openai.com/api/docs/guides/reasoning#controlling-costs) |
| What does `model_context_window` mean? | Numeric configuration for context-window tokens available to the active model. The reference does **not** state that it overrides model metadata, service limits, or account entitlements. | [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| What does `model_auto_compact_token_limit` mean? | Numeric threshold triggering automatic history compaction; leaving it unset uses model defaults. A compaction threshold is a context-management setting, not an advertised model capacity. | [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| What does the threshold count? | `model_auto_compact_token_limit_scope` defaults to `total`, counting the full active context. `body_after_prefix` instead counts growth after the carried compaction-window prefix. | [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Is Astra a native Codex model? | Astra is a recommended model. Availability depends on rollout, sign-in method, and client. Desktop, CLI, and IDE extension share `config.toml`. This page does not publish an Astra-specific native context maximum. | [Models](https://learn.chatgpt.com/docs/models) |

The [advanced configuration guide](https://learn.chatgpt.com/docs/config-file/config-advanced) demonstrates setting `model_context_window`, but does not promise arbitrary values will be honored. The [current Astra guide](https://developers.openai.com/api/docs/guides/latest-model) also does not establish a native Codex 1M override.

## Interpreting the observed native values

The assigning investigator reports CLI 0.154.0 catalog values of `context_window=272000`, `max_context_window=872000`, and `effective_context_window_percent=95`, plus an actual synthetic CLI result of **828,400** after requesting `model_context_window=1000000`. These are supplied local investigation findings, **not independently verified by this documentation-only pass**.

The arithmetic is consistent with a catalog cap followed by a client allowance:

```text
min(1,000,000 requested, 872,000 catalog maximum) = 872,000
872,000 × 95% = 828,400
```

The investigator also reports source-level auto-compaction clamping to 90% of the resolved context under the default `total` scope:

```text
min(900,000 requested threshold, 872,000 × 90%) = 784,800
```

These calculations explain the supplied observations if the reported implementation applies. The 95% allowance and 90% compaction clamp are separate client mechanisms. Their exact behavior, including server token-budget fallbacks, must be supported by the accompanying version-specific source/runtime investigation; the public configuration pages above do not document those percentages. In particular, do not describe the 95% reduction as proven to be merely cosmetic UI behavior.

## What remains unproven

- The inspected official documentation does not explain why native metadata chooses **872,000**. Although `1,000,000 - 128,000 = 872,000`, Astra's published API context is **1,050,000**, and `1,050,000 - 128,000 = 922,000`. The former subtraction alone is not evidence of the actual native output-reserve policy.
- The published API model specification establishes an API capacity, not that this ChatGPT-authenticated Codex route accepts the same input size. No large server request was tested here.
- Valid configuration keys do not guarantee that the requested **1,000,000 / 900,000** values survive native client resolution. The supplied runtime/source results indicate that they do not in the investigated CLI version; desktop-version behavior requires its own check.

**Conclusion:** Keep API model capacity, native catalog capacity, effective client budget, and compaction threshold separate. Official docs support configuring context management, but do not support promising an uncapped native 1M context merely by adding these two keys.
