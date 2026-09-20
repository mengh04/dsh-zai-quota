# dsh-zai-quota

DeepSeek Harness 的智谱（Z.AI）编程套餐额度插件：会话选择智谱模型（如 `zai-coding-cn`）时，输入框上下文概览面板底部显示各计量窗口（5 小时滚动 / 每周 / 每月 MCP）的已用百分比、剩余额度与重置倒计时；切换到其他模型时自动隐藏并停止读取。凭据始终留在主机进程内。

针对 dsh `0.1.5-rc.2` 官方发布版开发；以树外组合包安装，无需修改或重建 Web 外壳。
## 截图

<img width="449" height="494" alt="图片" src="https://github.com/user-attachments/assets/e960c871-40cb-49c2-8102-94c4bad556c4" />

## 结构

| 目录 | 包 | 作用 |
| --- | --- | --- |
| `host/` | `@deepseek-ai/dsh-host-zai-quota` | 主机半边：`/zai-quota/usage` 路由、凭据解析、提供方请求、缓存 |
| `client/` | `@deepseek-ai/dsh-client-ui-zai-quota` | 浏览器半边：上下文弹层内的额度区块与 provider 门控 |
| `bundle/` | `dsh-zai-quota-bundle` | 组合壳：携带两条插件行的 `dsh.bundle` patch |

## 构建

需要 Node ≥ 22 与 pnpm：

```sh
./build.sh
```

产出三个 tarball 到 `dist/`。`./build.sh install` 在构建后直接装入 profile（`PROFILE=web` 默认）。

## 安装

```sh
git clone https://github.com/mengh04/dsh-zai-quota.git
cd dsh-zai-quota
./build.sh install
```

安装后重启 dsh（如 `systemctl --user restart deepseek-harness`）并硬刷新页面（Ctrl+Shift+R）。

## 凭据

主机半边通过组合的 `credentials` 服务解析 `ZAI_CODING_CN_API_KEY`（`~/.dsh/.credentials.yaml`）。

## 卸载

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-host-zai-quota @deepseek-ai/dsh-client-ui-zai-quota dsh-zai-quota-bundle
```
