---
type: decision
project: wisp
updated: 2026-09-08
tags: [context, decisions, codex, bridge]
---

# Codex Wisp follows the native contract before implementation

**Decision:** The accepted compatibility contract is [spec #208](https://github.com/EstarinAzx/Wisp-Router/issues/208), implemented by #209–#211. It preserves native model selection and uses the existing live Routing map. The spec owns the supported stateless subset, explicit limits, and credential-boundary mechanism.

**Why:** Fourteen isolated `codex-cli 0.153.4` probes showed that model metadata changes the native tool envelope and a completion-only stream can exit zero while losing final text. Forcing an unknown routing label or supporting functions alone would therefore give misleading results. An independent GPT-5.6 Sol critic accepted the revised plan after a GPT-6 Astra Partner supplied mechanically checked record warrants.

**Reversibility:** Easy before publication. Broader opaque reasoning support requires a later compatibility design. This run authorizes source/ticket/review work and local package preparation; publication and installation remain separate decisions.

## Related

- [[decisions]]
- [[active-work]]
- [[happy-path]]
