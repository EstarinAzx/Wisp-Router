---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Codex: bearer is the access_token, NOT the exchanged API key

For the subscription path (`https://chatgpt.com/backend-api/codex/responses`), the bearer is the OAuth
**`access_token`** + the `chatgpt-account-id` header. The id_token→`sk-` exchange (`exchangeCodexIdTokenForApiKey`
in the reference) produces an **API-platform** key billed against `api.openai.com` — a *different* endpoint. Wisp
keeps `apiKey` only as a fallback; `codexClient` sends `creds.accessToken || creds.apiKey`. Don't switch the
default bearer to the exchanged key — it routes off the subscription. `chatgpt-account-id` is **hard-required**:
absent → error early (`codexClient` throws) rather than send a header-less request that 401/403s opaquely.

## Related

- [[gotchas]] — index
