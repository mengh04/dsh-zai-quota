/** Quota section portaled into the composer's context-overview panel. */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ZaiQuotaFailure, ZaiQuotaWindow } from '@deepseek-ai/dsh-host-zai-quota/shared'
import type { ZaiQuotaState } from './controller.ts'
import { NS, type ZaiQuotaKey } from './locales.ts'
import css from './ZaiQuotaSection.module.css'

/** Browser operations and state injected into the composer-dock contribution. */
export interface ZaiQuotaSectionInjected {
  hooks: {
    quota: ObservableSnapshot<ZaiQuotaState>
  }
  /** The session's shared model directory; its `current` provider gates the section. */
  directory: SnapshotStore<ModelDirectoryState>
  load: () => void
}

/** Full props for the composer dock's quota entry. */
export type ZaiQuotaSectionProps =
  PropsRuntime<'conversation.composer.dock'>
  & PropsLocale<typeof NS>
  & InjectFace<ZaiQuotaSectionInjected>

/**
 * The quota metering belongs to the Z.AI coding plan, so the section renders
 * only while the session's selected provider is a Z.AI one (for example
 * `zai-coding-cn`); every other provider renders nothing.
 */
const ZAI_PROVIDER_PATTERN = /^zai/i

/**
 * The released context-overview panel offers no slot, so the section rides a
 * portal into it: it recognizes the panel by its dialog role and localized
 * label (`上下文已用` / `of context used`). The released composer renders the
 * panel inline inside the app tree rather than at the body level, so the
 * search covers every dialog in the document.
 */
const CONTEXT_PANEL_LABEL = /上下文已用|of context used/i

/**
 * Whether an element is the composer's context-overview panel.
 * @param element - a candidate dialog element from the document.
 * @returns True when the element is the open context panel.
 */
function isContextPanel(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement
    && element.getAttribute('role') === 'dialog'
    && CONTEXT_PANEL_LABEL.test(element.getAttribute('aria-label') ?? '')
}

/**
 * Find the open context-overview panel anywhere in the document.
 * @returns The panel element, or null while it is closed.
 */
function findContextPanel(): HTMLElement | null {
  for (const candidate of document.querySelectorAll('[role="dialog"]')) {
    if (isContextPanel(candidate)) return candidate
  }
  return null
}

/** Label key per provider window kind. */
const WINDOW_LABEL: Record<ZaiQuotaWindow['kind'], ZaiQuotaKey> = {
  rolling: 'quota.window.rolling',
  weekly: 'quota.window.weekly',
  monthly: 'quota.window.monthly',
}

/** Label key per host failure code. */
const FAILURE_LABEL: Record<ZaiQuotaFailure, ZaiQuotaKey> = {
  'no-credential': 'quota.error.noCredential',
  unreachable: 'quota.error.unreachable',
  'upstream-failed': 'quota.error.upstreamFailed',
}

/**
 * Render time to a window reset through the section's own unit templates.
 * @param milliseconds - remaining time; a non-positive value reads as due now.
 * @param t - the section's locale seat.
 * @returns Localized coarse duration, for example `46 分钟`.
 */
function formatDuration(milliseconds: number, t: ZaiQuotaSectionProps['t']): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000))
  if (minutes < 60) return t('quota.duration.minutes', { value: String(minutes) })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('quota.duration.hours', { value: String(hours) })
  return t('quota.duration.days', { value: String(Math.round(hours / 24)) })
}

/** Keep the bar inside its track regardless of the provider's figure. */
function barWidth(percent: number): string {
  return `${String(Math.min(100, Math.max(0, percent)))}%`
}

/**
 * One plan window: its used-share meter, the remaining allowance, and the
 * next reset.
 * @param props - window reading plus the section's locale seat.
 * @returns The window row.
 */
function WindowRow({ window, t }: { window: ZaiQuotaWindow; t: ZaiQuotaSectionProps['t'] }) {
  return (
    <li className={css.window}>
      <div className={css.windowHead}>
        <span>{t(WINDOW_LABEL[window.kind])}</span>
        <span className={css.figure}>{t('quota.remainingPercent', { percent: String(window.percent) })}</span>
      </div>
      <div className={css.bar}>
        <div className={css.fill} style={{ width: barWidth(window.percent) }} />
      </div>
      <div className={css.detail}>
        {t('quota.windowDetail', { remaining: String(window.remaining), limit: String(window.limit) })}
        {' · '}
        {t('quota.resetsIn', { duration: formatDuration(window.resetsAt - Date.now(), t) })}
      </div>
    </li>
  )
}

/**
 * The context panel's quota section body: one row per plan window.
 * @param props - the reading, the load callback, and the section's locale seat.
 * @returns The section, or loading/failure text.
 */
function QuotaBody({ state, load, t }: { state: ZaiQuotaState; load: () => void } & Pick<ZaiQuotaSectionProps, 't'>) {
  if (state.status === 'loading') {
    return <div className={css.section}><span className={css.muted}>{t('quota.loading')}</span></div>
  }
  if (state.status === 'failed') {
    return (
      <div className={css.section}>
        <div className={css.failure}>
          <span className={css.muted}>{t(FAILURE_LABEL[state.code])}</span>
          <button type="button" className={css.retry} onClick={load}>{t('quota.retry')}</button>
        </div>
      </div>
    )
  }
  return (
    <div className={css.section}>
      <div className={css.head}>
        <span className={css.title}>{t('quota.title')}</span>
        {state.level === '' ? null : <span className={css.level}>{state.level}</span>}
      </div>
      <ul className={css.windows}>
        {state.windows.map(window => <WindowRow key={window.kind} window={window} t={t} />)}
      </ul>
    </div>
  )
}

/**
 * The composer dock's quota entry: renders nothing in the dock itself. While
 * the session's selected provider is Z.AI, it watches the document body for
 * the context-overview panel and portals the section below its breakdown; the
 * section appears and disappears with the panel.
 * @param props - injected reading, model directory, load callback, and the section's locale seat.
 * @returns Nothing in place; the section rides a portal into the panel.
 */
export function ZaiQuotaSection({ useQuota, directory, load, t }: ZaiQuotaSectionProps) {
  const selection = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot().current,
  )
  const isZai = selection !== null && ZAI_PROVIDER_PATTERN.test(selection.provider)
  const state = useQuota(s => s)
  const [panel, setPanel] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!isZai) {
      setPanel(null)
      return
    }
    const rescan = (): void => {
      setPanel(findContextPanel())
    }
    // The panel is rendered inline by the released composer, so only a
    // subtree-wide childList watch sees its appearance and removal.
    const observer = new MutationObserver(rescan)
    observer.observe(document.body, { childList: true, subtree: true })
    rescan()
    return () => {
      observer.disconnect()
      setPanel(null)
    }
  }, [isZai])

  useEffect(() => {
    if (isZai && panel !== null) load()
  }, [isZai, panel, load])

  if (!isZai || panel === null) return null
  return createPortal(<QuotaBody state={state} load={load} t={t} />, panel)
}
