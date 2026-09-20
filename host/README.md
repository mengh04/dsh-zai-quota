---
description: "Host half of the Z.AI coding-plan quota panel: one webServer route resolving the plan credential and reading the provider's quota endpoint."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-zai-quota

English | [中文](README.zh.md)

## Summary

Use `dsh-host-zai-quota` with its [browser companion](../../client/ui-zai-quota/README.md) to show a Z.AI coding plan's remaining allowance in the composer's context popover. The package serves one `GET` route: it resolves the plan credential through the composition's `credentials` service, reads the provider's quota endpoint under a deadline and without following redirects, and hands the browser one reading per metering window. The credential never leaves the host process, the browser receives window readings only, and a missing credential, an unreachable provider, and an unrecognized answer each answer with a distinct failure.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in a composition that carries `webServer` and `connection`, normally beside its browser surface [`dsh-client-ui-zai-quota`](../../client/ui-zai-quota/README.md), which renders the route's reading inside the composer's context-overview panel while the session's selected provider is Z.AI.

```yaml
- name: '@deepseek-ai/dsh-host-zai-quota'
  config:
    credentialRef: ZAI_CODING_CN_API_KEY
    endpoint: https://open.bigmodel.cn/api/monitor/usage/quota/limit
    timeoutMs: 10000
    cacheMs: 60000
```

| Field | Meaning |
|---|---|
| `credentialRef` | Credential reference holding the plan's API key, re-resolved per request. |
| `endpoint` | Absolute URL of the provider's quota endpoint. |
| `timeoutMs` | Deadline for one provider request. |
| `cacheMs` | How long one successful reading is reused; `0` reads every request. |

All four are required: they vary by deployment and provider, so the composition states them instead of the package carrying a default.

### When to choose it

Choose it for a Web deployment whose model routes are a Z.AI coding plan and whose users want the plan's remaining allowance beside the context reading it competes with. Avoid it for a pay-as-you-go key: the quota endpoint meters a subscription plan, and a key without one answers no recognizable window.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/index.ts`](src/index.ts) registers one exact `GET /zai-quota/usage` route on `ctx.webServer`. Every request asks the composition's `connection` service for a rejection first (`requestRejection`): its Host/Origin fence defeats DNS rebinding and cross-site calls, and its browser authentication gates the caller before any credential is resolved. Past that fence the route resolves the configured reference through `ctx.get('credentials')` (an absent service reads as unconfigured), issues a `redirect: 'error'` request with `Authorization: Bearer` under `AbortSignal.timeout`, and maps the provider's `limits` rows to window readings: `TOKENS_LIMIT`/`CREDIT_LIMIT` with `unit` 3 / `number` 5 is the rolling 5-hour window, `unit` 6 / `number` 1 the weekly one, and `TIME_LIMIT` a monthly MCP window; other rows render nothing. A successful reading is reused for `cacheMs`; failures are never cached.

Failures are told apart by HTTP status: 409 for no stored credential, 502 for a provider HTTP failure or an unusable answer, and 504 when the request never reached the provider. No answer body carries the credential or the provider's own text.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-client-ui-zai-quota](../../client/ui-zai-quota/README.md) — the browser section consuming this route.
- [dsh-host-webserver](../webserver/README.md) — the route registry carrying the endpoint.
- [dsh-credentials](../../credentials/credentials/README.md) — the capability resolving `credentialRef`.
- [Host package map](../README.md) — the GUI-host family this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package shows a subscription quota to a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests. Its one outbound read is the quota endpoint, which carries no prompt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The window vocabulary is fixed.** The package recognizes the rolling, weekly, and monthly windows by the provider's `(type, unit, number)` rows; a plan metering a different allowance renders no row for it, and a reading whose rows are all unrecognized is answered as a failure.
- **Readings exist only while a browser asks.** The route polls nothing and pushes nothing; `cacheMs` is the only bound on provider traffic.
- **The credential reference comes from the composition.** The package does not read the model-provider settings to infer it, so a plan key swap is a configuration change.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Raw `webServer` routes were chosen over a Typert Remote, matching [`dsh-host-open-in-app`](../open-in-app/README.md) in this repository: the feature is Web-only, the route plus browser `fetch` needs far less wiring than a generated remote contribution, and both the trust fence and the browser-safe `./shared` payload have existing precedent there.

</details>

**Runtime invariant:** No companion is published. The package holds one route registration and one reading cache, both released with the plugin fiber, which the route spec proves with a 404 after Loader-entry disposal.
