---
description: "输入框上下文概览面板内展示 Z.AI（智谱）编程套餐额度窗口的浏览器小节，读数来自 @deepseek-ai/dsh-host-zai-quota 的主机路由，仅在会话选定的提供方为 Z.AI 时渲染。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-zai-quota

[English](README.md) | 中文

## 概述

将 `dsh-client-ui-zai-quota` 与其[主机配套包](../../host/zai-quota/README.zh.md)一起使用，在输入框的上下文概览面板里显示 Z.AI 编程套餐的剩余额度。本小节注册进 [`ui-conversation`](../ui-conversation/README.zh.md) 声明的 `conversation.composer.dock` 槽位但不在原地渲染，而是以 portal 挂进该面板，且仅在会话选定的提供方为 Z.AI（例如 `zai-coding-cn`）时渲染，切到其他提供方即隐藏并停止读取。凭据缺失、提供方不可达、以及应答无法识别各自渲染为一行可重试的提示；选中 Z.AI 提供方之前不发生任何读取。

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

在 Web 组合中与主机半边 [`dsh-host-zai-quota`](../../host/zai-quota/README.zh.md) 成对挂载。本包无需配置：凭据、提供方端点、请求期限与读数缓存都在主机半边。

小节为路由返回的每个窗口渲染一行——5 小时滚动额度与每周额度，提供方给出时还包括每月 MCP 窗口——每行显示已用百分比、剩余额度与下次重置时间。提供方报告套餐档位时，档位显示在标题旁。

### 何时选用

当部署的模型路由是 Z.AI 编程套餐、且用户希望在上下文读数旁看到与其竞争的套餐剩余额度时选用本包。按量付费的 Key 不适用：额度端点计量的是订阅套餐，没有套餐的 Key 不会返回可识别的窗口。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

[`src/client/index.ts`](src/client/index.ts) 注册字典，并用 `ctx.slots.inject` 等待 `conversation.composer.dock` 声明，因此贡献只在 [`ui-conversation`](../ui-conversation/README.zh.md) 声明该槽位期间出现，并随声明一起消失。[`src/client/controller.ts`](src/client/controller.ts) 为整个页面持有一个 `ZaiQuotaState` 快照——`loading`、带提供方窗口的 `ready`、或带主机路由失败码的 `failed`——并让并发调用共享同一次读取。[`src/client/ZaiQuotaSection.tsx`](src/client/ZaiQuotaSection.tsx) 通过 `ctx.modelDirectories` 读取会话的模型目录，非 Z.AI 提供方不渲染任何内容，否则监视 document body、按本地化标签识别上下文概览面板（一个 body 级 dialog），并把小节以 portal 挂入其中；小节随面板出现与消失。

路由路径与窗口载荷类型只在主机包的浏览器安全 `./shared` 子路径里有一份归属，由客户端 bundle 内联。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-host-zai-quota](../../host/zai-quota/README.zh.md) — 解析套餐凭据并读取提供方的路由。
- [dsh-client-ui-conversation](../ui-conversation/README.zh.md) — 其 dock 声明本小节槽位的输入框。
- [dsh-client-ui-model-selection](../ui-model-selection/README.zh.md) — 以当前选定门控本小节的每会话模型目录。
- [dsh-client-store](../store/README.zh.md) — 把读数送到组件的快照存储。
- [Web 客户端技术栈](../README.zh.md) — 本包所属的 GUI 家族。

-----

<a id="model-experience"></a>
## 模型体验

无。本包为人类读取订阅额度，不接触任何提示词、消息、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送提供方请求，其唯一的外部读取是主机路由的提供方请求，且不携带提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **提供方门控按 `zai` 前缀不区分大小写匹配提供方 id。** 挂在别的命名提供方 id 后面的 Z.AI 套餐不会渲染；此类路由需调整 `src/client/ZaiQuotaSection.tsx` 中的 `ZAI_PROVIDER_PATTERN`。
- **窗口词汇固定。** 本小节按提供方的 `(type, unit, number)` 行命名滚动、每周与每月窗口；以别的额度计量的套餐不会渲染出对应行。
- **浏览器侧按需读取且不缓存。** Z.AI 选定下每次打开面板读取一次主机路由；主机侧的 `cacheMs` 是提供方流量的唯一上限。
- **面板锚点是发布版 DOM。** 小节按 dialog 角色与本地化标签（`上下文已用` / `of context used`）识别上下文面板；发布版若重命名该标签，portal 会失效，需要同步调整 `CONTEXT_PANEL_LABEL`。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

本小节复用既有的 `conversation.composer.dock` 槽位与 body 级 portal，因此未经修改的发布版 [`ui-conversation`](../ui-conversation/README.zh.md) 即可在上下文面板里显示它：本包可作为树外组合包安装，无需重建 Web 外壳。

</details>

**运行时不变式：** 未发布配套检查。本小节只持有一个读数快照与一个读取载体，其全部交互是用户打开面板、重试与槽位销毁，浏览器半边规格用 fiber 销毁证明了最后一项。
