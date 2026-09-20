---
description: "Browser section inside the composer's context-overview panel showing the Z.AI (智谱) coding-plan quota windows read through the host route of @deepseek-ai/dsh-host-zai-quota, rendered only while the session's selected provider is Z.AI."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-zai-quota

English | [中文](README.zh.md)

## Summary

Use `dsh-client-ui-zai-quota` with its [host companion](../../host/zai-quota/README.md) to show a Z.AI coding plan's remaining allowance inside the composer's context-overview panel. The entry registers into the `conversation.composer.dock` slot that [`ui-conversation`](../ui-conversation/README.md) declares and renders nothing there; instead it portals into the panel, and only while the session's selected provider is Z.AI (for example `zai-coding-cn`), so switching to any other provider hides it and stops its reads. A missing credential, an unreachable provider, and an unrecognized answer each render one retryable line; nothing is read until a Z.AI provider is selected.

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

Mount the package beside [`dsh-host-zai-quota`](../../host/zai-quota/README.md) in a Web composition. No configuration: the credential, the provider endpoint, the request deadline, and the reading cache all live on the host half.

The section renders one row per window the host route reports — the rolling 5-hour allowance and the weekly allowance, plus a monthly MCP window when the provider includes one — each with its used percentage, remaining allowance, and time to the next reset. The provider's plan tier renders beside the heading when it reports one.

### When to choose it

Choose it for a Web deployment whose model routes are a Z.AI coding plan and whose users want the plan's remaining allowance beside the context reading it competes with. Avoid it for a pay-as-you-go key: the quota endpoint meters a subscription plan, and a key without one answers no recognizable window.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/client/index.ts`](src/client/index.ts) registers the dictionaries and waits for the `conversation.composer.dock` declaration with `ctx.slots.inject`, so the contribution appears only while [`ui-conversation`](../ui-conversation/README.md) declares the slot and disappears with it. [`src/client/controller.ts`](src/client/controller.ts) owns one `ZaiQuotaState` snapshot for the page — `loading`, `ready` with the provider's windows, or `failed` with the host route's failure code — and shares one in-flight read between concurrent callers. [`src/client/ZaiQuotaSection.tsx`](src/client/ZaiQuotaSection.tsx) reads the session's model directory through `ctx.modelDirectories`, renders nothing for a non-Z.AI provider, and otherwise watches the document body for the context-overview panel (a body-level dialog whose localized label it recognizes) and portals the section into it; the section appears and disappears with the panel.

The route path and the window payload types have one home in the host package's browser-safe `./shared` subpath, which the client bundle inlines.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-host-zai-quota](../../host/zai-quota/README.md) — the route that resolves the plan credential and reads the provider.
- [dsh-client-ui-conversation](../ui-conversation/README.md) — the composer whose dock declares the section's slot.
- [dsh-client-ui-model-selection](../ui-model-selection/README.md) — the per-session model directory whose current selection gates the section.
- [dsh-client-store](../store/README.md) — the snapshot store carrying the reading to the component.
- [Web client stack](../README.md) — the GUI family this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package reads a subscription quota for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests. Its one outbound read is the host route's provider request, which carries no prompt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The provider gate matches provider ids case-insensitively from `zai`.** A Z.AI plan behind a differently named provider id renders nothing; adjust `ZAI_PROVIDER_PATTERN` in `src/client/ZaiQuotaSection.tsx` for such a route.
- **The window vocabulary is fixed.** The section names the rolling, weekly, and monthly windows by the provider's `(type, unit, number)` rows; a plan that meters a different allowance renders no row for it.
- **Reads are on demand and uncached in the browser.** Each panel open under a Z.AI selection reads the host route; the host's `cacheMs` is the only bound on provider traffic.
- **The panel anchor is the released DOM.** The section recognizes the context panel by its dialog role and localized label (`上下文已用` / `of context used`); a release that renames that label stops the portal until `CONTEXT_PANEL_LABEL` follows it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The section rides the pre-existing `conversation.composer.dock` slot and a body-level portal, so an unmodified released [`ui-conversation`](../ui-conversation/README.md) shows it inside the context panel: the package installs as an out-of-tree bundle without rebuilding the Web shell.

</details>

**Runtime invariant:** No companion is published. The section holds one reading snapshot and one read carrier whose only interactions are a user-opened panel, a retry, and slot disposal, which the browser-half spec proves through fiber teardown.
