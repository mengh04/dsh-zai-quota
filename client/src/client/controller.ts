/** Browser quota state and the host-route carrier for the context-panel section. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  ZAI_QUOTA_ROUTE,
  type ZaiQuotaErrorPayload,
  type ZaiQuotaFailure,
  type ZaiQuotaPayload,
} from '@deepseek-ai/dsh-host-zai-quota/shared'

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** What the section renders: an in-flight read, the provider's readings, or a failure. */
export type ZaiQuotaState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly level: string; readonly windows: ZaiQuotaPayload['windows'] }
  | { readonly status: 'failed'; readonly code: ZaiQuotaFailure; readonly message: string }

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

/** Whether a decoded wire value is one of this route's failure codes. */
function isFailure(value: unknown): value is ZaiQuotaFailure {
  return value === 'no-credential' || value === 'unreachable' || value === 'upstream-failed'
}

/** Readable text for an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read the failure payload the host route answers with, falling back to the
 * HTTP status when the body is not one (any proxy in front of the Host can
 * answer instead of it).
 * @param response - the host route's non-OK response.
 * @returns The decoded failure, or a status-only one.
 */
async function readFailure(response: Response): Promise<ZaiQuotaErrorPayload> {
  try {
    const body = await response.json() as { readonly code?: unknown; readonly message?: unknown }
    if (isFailure(body.code) && typeof body.message === 'string') {
      return { code: body.code, message: body.message }
    }
  } catch {
    // Swallows the body-decoding failure: the HTTP status below is the whole fact.
  }
  return { code: 'upstream-failed', message: `HTTP ${String(response.status)}` }
}

/**
 * Owns the last quota reading for the page and the read itself. The reading
 * publishes through a uSES-safe source, so closing and reopening the context
 * panel keeps the previous figures on screen while the next read is in flight.
 */
export class ZaiQuotaController {
  /** Latest reading, or the first load's placeholder. */
  readonly state: SnapshotStore<ZaiQuotaState> = createSnapshotStore<ZaiQuotaState>({ status: 'loading' })

  private inFlight: Promise<void> | undefined

  /**
   * @param fetcher - HTTP carrier for the host route read.
   */
  constructor(private readonly fetcher: Fetch = (input, init) => fetch(input, init)) {}

  /**
   * Read the host route; concurrent callers share one read, and a later call
   * after it settles reads again.
   * @returns after the reading is published.
   */
  load(): Promise<void> {
    this.inFlight ??= this.run()
    return this.inFlight
  }

  private async run(): Promise<void> {
    try {
      const response = await this.fetcher(new URL(ZAI_QUOTA_ROUTE, hostBase()), {
        headers: { accept: 'application/json' },
      })
      if (response.ok) {
        const payload = await response.json() as ZaiQuotaPayload
        this.state.set({ status: 'ready', level: payload.level, windows: payload.windows })
      } else {
        const failure = await readFailure(response)
        this.state.set({ status: 'failed', code: failure.code, message: failure.message })
      }
    } catch (error: unknown) {
      // Swallows the transport failure: an unreachable host is one retryable
      // failure for the section, and the host route stays the quota authority.
      this.state.set({ status: 'failed', code: 'unreachable', message: messageOf(error) })
    } finally {
      this.inFlight = undefined
    }
  }
}
