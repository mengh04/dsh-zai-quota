// @vitest-environment jsdom

/** Section behavior: provider gating, the panel portal, every rendered state, and the retry action. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ZaiQuotaSection, type ZaiQuotaSectionProps } from '../src/client/ZaiQuotaSection.tsx'
import type { ZaiQuotaState } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const t = makeTranslate(zh) as ZaiQuotaSectionProps['t']

/**
 * A model directory stub whose `current` selection never changes; the section
 * only reads `current`, so the remaining directory fields stay absent.
 * @param provider - the selected provider id, or null for no selection yet.
 */
function directoryOf(provider: string | null): ZaiQuotaSectionProps['directory'] {
  // One frozen snapshot reference: useSyncExternalStore rerenders on every
  // reference change, so the stub must return a stable one.
  const snapshot = {
    current: provider === null ? null : { provider, model: 'glm-5.3' },
  } as ModelDirectoryState
  return {
    subscribe: () => () => { /* no selection changes in this bench */ },
    getSnapshot: () => snapshot,
  } as unknown as ZaiQuotaSectionProps['directory']
}

/** Open the context-overview panel the way the released composer does: an inline dialog inside a container. */
function openPanel(): HTMLElement {
  const panel = document.createElement('div')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '上下文已用')
  const container = document.createElement('div')
  container.append(panel)
  document.body.append(container)
  return panel
}

/** Render the section over a fixed reading, a fixed provider, and a recording load callback. */
function bench(state: ZaiQuotaState, provider: string | null = 'zai-coding-cn') {
  const source = createSnapshotStore<ZaiQuotaState>(state)
  const load = vi.fn()
  function useQuota<T>(select: (value: ZaiQuotaState) => T): T {
    return select(source.getSnapshot())
  }
  // The scope's standard props are the framework's; this bench feeds only the
  // injected face and the locale seat the section reads.
  const props = { useQuota, directory: directoryOf(provider), load, t } as unknown as ZaiQuotaSectionProps
  const view = render(<ZaiQuotaSection {...props} />)
  return { view, load, source }
}

describe('ZaiQuotaSection', () => {
  it('renders nothing in the dock and reads nothing while the panel is closed', () => {
    const { view, load } = bench({ status: 'loading' })
    expect(view.container.textContent).toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it.each([
    ['deepseek-official', 'a non-Z.AI provider'],
    [null, 'no selection yet'],
  ] as const)('renders nothing and reads nothing for %s, even with the panel open', (provider) => {
    const { view, load } = bench({ status: 'ready', level: 'pro', windows: [] }, provider)
    openPanel()
    expect(view.container.textContent).toBe('')
    expect(document.body.textContent).toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it('ignores a body dialog that is not the context panel', async () => {
    const { load } = bench({ status: 'loading' })
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    document.body.append(other)
    await new Promise((resolve: () => void) => { setTimeout(resolve, 0) })
    expect(other.textContent).toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it('portals into the open context panel and reads the host route', async () => {
    const { view, load } = bench({ status: 'loading' })
    const panel = openPanel()
    await waitFor(() => {
      expect(panel.textContent).toBe('正在查询额度…')
    })
    expect(view.container.textContent).toBe('')
    expect(load).toHaveBeenCalledOnce()
  })

  it('removes the portaled section when the panel closes', async () => {
    const panel = openPanel()
    const { view } = bench({ status: 'loading' })
    await waitFor(() => {
      expect(panel.textContent).toBe('正在查询额度…')
    })
    panel.remove()
    await waitFor(() => {
      expect(document.body.textContent).toBe('')
    })
    expect(view.container.textContent).toBe('')
  })

  it('renders one window row per reading with its remaining allowance and reset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T10:35:00Z'))
    const panel = openPanel()
    const { view } = bench({
      status: 'ready',
      level: 'pro',
      windows: [
        // 46 minutes out, matching the live provider's rolling window.
        { kind: 'rolling', limit: 12_000, used: 11_391, remaining: 608, percent: 94, resetsAt: Date.now() + 46 * 60_000 },
        // 3.9 days out, matching the live provider's weekly window.
        { kind: 'weekly', limit: 60_000, used: 44_597, remaining: 15_402, percent: 74, resetsAt: Date.now() + 94 * 60 * 60_000 },
      ],
    })
    const text = panel.textContent ?? ''
    expect(text).toContain('智谱编程套餐')
    expect(text).toContain('pro')
    expect(text).toContain('5 小时额度')
    expect(text).toContain('已用 94%')
    expect(text).toContain('剩余 608 / 12000')
    expect(text).toContain('46 分钟后重置')
    expect(text).toContain('每周额度')
    expect(text).toContain('已用 74%')
    expect(text).toContain('剩余 15402 / 60000')
    expect(text).toContain('4 天后重置')
    expect(view.container.textContent).toBe('')
    vi.useRealTimers()
  })

  it('renders the monthly window and clamps an out-of-range provider percentage', () => {
    const panel = openPanel()
    bench({
      status: 'ready',
      level: '',
      windows: [{ kind: 'monthly', limit: 100, used: 100, remaining: 0, percent: 240, resetsAt: Date.now() }],
    })
    const text = panel.textContent ?? ''
    expect(text).toContain('每月额度')
    expect(text).toContain('已用 240%')
    expect(text).toContain('0 分钟后重置')
    // The track never overflows its container regardless of the provider's figure.
    expect(panel.querySelector<HTMLElement>('[style]')?.style.width).toBe('100%')
  })

  it('renders a negative percentage as an empty track', () => {
    const panel = openPanel()
    bench({
      status: 'ready',
      level: '',
      windows: [{ kind: 'rolling', limit: 10, used: 0, remaining: 10, percent: -4, resetsAt: Date.now() + 120 * 60_000 }],
    })
    expect(panel.querySelector<HTMLElement>('[style]')?.style.width).toBe('0%')
    expect(panel.textContent).toContain('2 小时后重置')
  })

  it.each([
    ['no-credential', '未配置该套餐的 API Key'],
    ['unreachable', '无法连接智谱服务'],
    ['upstream-failed', '智谱未返回可识别的额度'],
  ] as const)('renders the %s failure and retries through the injected load', (code, copy) => {
    const panel = openPanel()
    const { load } = bench({ status: 'failed', code, message: 'detail' })
    expect(panel.textContent).toContain(copy)
    expect(panel.textContent).not.toContain('detail')
    fireEvent.click(panel.querySelector<HTMLButtonElement>('button')!)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
