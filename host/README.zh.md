---
description: "Z.AI（智谱）编程套餐额度面板的主机半边：一条 webServer 路由解析套餐凭据并读取提供方的额度端点。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-zai-quota

[English](README.md) | 中文

## 概述

将 `dsh-host-zai-quota` 与其[浏览器配套包](../../client/ui-zai-quota/README.zh.md)一起使用，在会话选定 Z.AI 提供方时于输入框上下文概览面板内显示 Z.AI 编程套餐的剩余额度。本包只提供一条 `GET` 路由：它通过组合的 `credentials` 服务解析套餐凭据，在请求期限与不跟随重定向的约束下读取提供方的额度端点，并把每个计量窗口的读数交给浏览器。凭据始终留在主机进程内，浏览器只收到窗口读数；未存储凭据、提供方不可达、以及无法识别的应答各自对应一种明确的失败。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在带有 `webServer` 与 `connection` 的组合中挂载本包，通常与其浏览器半边 [`dsh-client-ui-zai-quota`](../../client/ui-zai-quota/README.zh.md) 成对使用。

```yaml
- name: '@deepseek-ai/dsh-host-zai-quota'
  config:
    credentialRef: ZAI_CODING_CN_API_KEY
    endpoint: https://open.bigmodel.cn/api/monitor/usage/quota/limit
    timeoutMs: 10000
    cacheMs: 60000
```

| 字段 | 含义 |
|---|---|
| `credentialRef` | 保存套餐 API Key 的凭据引用，每次请求重新解析。 |
| `endpoint` | 提供方额度端点的绝对 URL。 |
| `timeoutMs` | 单次提供方请求的期限。 |
| `cacheMs` | 一次成功读数的复用时长；`0` 表示每次请求都读取。 |

四个字段都是必填：它们随部署与提供方而变，因此由组合显式给出，而不是内置默认值。

### 何时选用

当部署的模型路由是 Z.AI 编程套餐、且用户希望在上下文读数旁看到与其竞争的套餐剩余额度时选用本包。按量付费的 Key 不适用：额度端点计量的是订阅套餐，没有套餐的 Key 不会返回可识别的窗口。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

[`src/index.ts`](src/index.ts) 在 `ctx.webServer` 上注册一条精确匹配的 `GET /zai-quota/usage` 路由。每个请求先向组合的 `connection` 服务索取拒绝结果（`requestRejection`）：其 Host/Origin 围栏阻止 DNS 重绑定与跨站调用，浏览器认证则先于任何凭据解析。通过围栏后，路由用 `ctx.get('credentials')` 解析配置的引用（没有该服务时按未配置处理），以 `Authorization: Bearer` 发出 `redirect: 'error'` 的请求并受 `AbortSignal.timeout` 约束，然后把提供方的 `limits` 行映射为窗口读数：`TOKENS_LIMIT`/`CREDIT_LIMIT` 且 `unit` 3 / `number` 5 为 5 小时滚动窗口，`unit` 6 / `number` 1 为每周窗口，`TIME_LIMIT` 为每月 MCP 窗口；其余行不渲染。成功读数在 `cacheMs` 内复用，失败从不缓存。

失败按 HTTP 状态区分：未配置凭据为 409，提供方 HTTP 失败或应答不可用为 502，请求未到达提供方为 504。应答体从不携带凭据或提供方原文。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-client-ui-zai-quota](../../client/ui-zai-quota/README.zh.md) — 消费该路由的浏览器小节。
- [dsh-host-webserver](../webserver/README.zh.md) — 承载该路由的注册表。
- [dsh-credentials](../../credentials/credentials/README.zh.md) — 解析 `credentialRef` 的凭据能力。
- [主机包一览](../README.zh.md) — 本包所属的 GUI 主机家族。

-----

<a id="model-experience"></a>
## 模型体验

无。本包为人类展示订阅额度，不接触任何提示词、消息、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送提供方请求，其唯一的外部读取是额度端点，且不携带提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **窗口词汇固定。** 本包按提供方的 `(type, unit, number)` 行识别滚动、每周与每月窗口；若套餐以别的额度计量，该额度不会渲染出对应行，且当没有任何行可识别时整次读取按失败处理。
- **读数只在浏览器请求时产生。** 路由不做后台轮询，也没有推送通道；`cacheMs` 是提供方流量的唯一上限。
- **凭据引用由组合给出。** 本包不读取模型提供方设置来推断引用；换了套餐 Key 就要改这一行配置。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

选择原生 `webServer` 路由而非 Typert Remote，与同仓库的 [`dsh-host-open-in-app`](../open-in-app/README.zh.md) 一致：这是纯 Web 界面特性，路由加浏览器 `fetch` 的接线远少于生成式远程服务的贡献装配，而信任围栏与 `./shared` 子路径的浏览器安全载荷都有现成先例。

</details>

**运行时不变式：** 未发布配套检查。本包只持有一条路由注册与一个读数缓存，二者都随插件 fiber 一起释放，路由规格通过 Loader 条目销毁后的 404 证明了这一点。
