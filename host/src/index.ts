/**
 * Host half of the Z.AI (智谱) coding-plan quota panel: one `webServer` route
 * that resolves the plan credential through the composition's `credentials`
 * service and reads the provider's quota endpoint.
 *
 * Security has one home, here. The route asks the composition's `connection`
 * service for a rejection first (`requestRejection`): its Host/Origin fence
 * defeats DNS rebinding and cross-site calls, and its browser authentication
 * gates every caller. On top of that fence the credential never leaves this
 * process — the browser receives only the provider's window readings — and the
 * upstream response is bounded by a deadline and never follows a redirect.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import {
  ZAI_QUOTA_ROUTE,
  type ZaiQuotaErrorPayload,
  type ZaiQuotaPayload,
  type ZaiQuotaWindow,
} from './shared.ts'

export type * from './shared.ts'

/** Cordis function-plugin name. */
export const name = 'zai-quota'
/** The route carrier and the trust fence guarding the route. */
export const inject = ['webServer', 'connection']

/** Coding-plan quota host configuration. */
export interface Config {
  /** Credential reference holding the plan's API key, resolved per request. */
  readonly credentialRef: string
  /** Absolute URL of the provider's quota endpoint. */
  readonly endpoint: string
  /** Deadline for one provider request, in milliseconds. */
  readonly timeoutMs: number
  /** How long one successful reading is reused, in milliseconds; 0 reads every request. */
  readonly cacheMs: number
}

export const Config: z<Config> = z.object({
  credentialRef: z.string().role('credential-ref').required(),
  endpoint: z.string().required(),
  timeoutMs: z.number().step(1).min(1).max(120_000).required(),
  cacheMs: z.number().step(1).min(0).max(3_600_000).required(),
})

/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface ZaiQuotaConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** The composition's connection service (typed locally: its package is browser-side). */
function connectionOf(ctx: Context): ZaiQuotaConnection {
  return Reflect.get(ctx, 'connection') as ZaiQuotaConnection
}

/** One quota read: the provider's readings, or the failure the route answers with. */
type QuotaRead =
  | { readonly ok: true; readonly payload: ZaiQuotaPayload }
  | { readonly ok: false; readonly status: number; readonly failure: ZaiQuotaErrorPayload }

/** One provider row as it arrives from the wire: every field still unknown. */
interface UpstreamQuotaRow {
  readonly type?: unknown
  readonly unit?: unknown
  readonly number?: unknown
  readonly usage?: unknown
  readonly currentValue?: unknown
  readonly remaining?: unknown
  readonly percentage?: unknown
  readonly nextResetTime?: unknown
}

/** Readable text for an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One wire field as a finite number, or null when the provider sent anything else. */
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Classify one provider row by the allowance it meters.
 * @param row - one row of the provider's `limits` array.
 * @returns The window kind, or null for a row this build does not render.
 */
function windowKindOf(row: UpstreamQuotaRow): ZaiQuotaWindow['kind'] | null {
  if (row.type === 'TIME_LIMIT') return 'monthly'
  if (row.type !== 'TOKENS_LIMIT' && row.type !== 'CREDIT_LIMIT') return null
  // The plan meters a rolling 5-hour allowance and a weekly one; the provider
  // identifies them by (unit, number) rather than by a named field.
  if (row.unit === 3 && row.number === 5) return 'rolling'
  if (row.unit === 6 && row.number === 1) return 'weekly'
  return null
}

/**
 * Read the provider's quota body into the wire payload the browser consumes.
 * @param body - the decoded JSON body.
 * @returns The payload, or null when the body carries no readable window.
 */
function readQuota(body: unknown): ZaiQuotaPayload | null {
  if (typeof body !== 'object' || body === null) return null
  const envelope = body as { readonly code?: unknown; readonly success?: unknown; readonly data?: unknown }
  if (envelope.code !== 200 || envelope.success !== true) return null
  if (typeof envelope.data !== 'object' || envelope.data === null) return null
  const { limits, level } = envelope.data as { readonly limits?: unknown; readonly level?: unknown }
  if (!Array.isArray(limits)) return null
  const windows: ZaiQuotaWindow[] = []
  for (const raw of limits) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as UpstreamQuotaRow
    const kind = windowKindOf(row)
    if (kind === null) continue
    const limit = finiteNumber(row.usage)
    const used = finiteNumber(row.currentValue)
    const remaining = finiteNumber(row.remaining)
    const percent = finiteNumber(row.percentage)
    const resetsAt = finiteNumber(row.nextResetTime)
    if (limit === null || used === null || remaining === null || percent === null || resetsAt === null) continue
    windows.push({ kind, limit, used, remaining, percent, resetsAt })
  }
  if (windows.length === 0) return null
  return { level: typeof level === 'string' ? level : '', windows }
}

/** JSON response (no-store: quota readings are live facts). */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** Register the quota route behind the connection trust fence. */
export function apply(ctx: Context, config: Config): void {
  const ref = credentialRef(config.credentialRef)
  /** Last successful reading and when it was taken; failures are never cached. */
  let cached: { readonly at: number; readonly payload: ZaiQuotaPayload } | undefined

  const read = async (): Promise<QuotaRead> => {
    const credentials = ctx.get('credentials')
    const hit = credentials === undefined ? undefined : await credentials.resolve(ref)
    if (hit === undefined) {
      return {
        ok: false,
        status: 409,
        failure: {
          code: 'no-credential',
          message: `no credential stored for ${config.credentialRef}`,
        },
      }
    }
    let response: Response
    try {
      response = await fetch(config.endpoint, {
        headers: { authorization: `Bearer ${hit.value}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs),
      })
    } catch (error: unknown) {
      // Swallows the transport failure (DNS, TLS, deadline): for this route
      // every one of them has the same meaning — the provider was not reached.
      return {
        ok: false,
        status: 504,
        failure: { code: 'unreachable', message: `${config.endpoint}: ${messageOf(error)}` },
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        failure: { code: 'upstream-failed', message: `${config.endpoint} answered HTTP ${response.status}` },
      }
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      // Swallows the body-decoding failure: a non-JSON body carries no reading.
      return {
        ok: false,
        status: 502,
        failure: { code: 'upstream-failed', message: `${config.endpoint} answered an unreadable body` },
      }
    }
    const payload = readQuota(body)
    if (payload === null) {
      return {
        ok: false,
        status: 502,
        failure: { code: 'upstream-failed', message: `${config.endpoint} answered no recognizable quota` },
      }
    }
    return { ok: true, payload }
  }

  const current = async (): Promise<QuotaRead> => {
    if (cached !== undefined && Date.now() - cached.at < config.cacheMs) {
      return { ok: true, payload: cached.payload }
    }
    const result = await read()
    if (result.ok) cached = { at: Date.now(), payload: result.payload }
    return result
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ZAI_QUOTA_ROUTE,
    handler: async (req, res) => {
      const rejection = connectionOf(ctx).requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return
      }
      const result = await current()
      if (result.ok) sendJson(res, 200, result.payload)
      else sendJson(res, result.status, result.failure)
    },
  }), `zai-quota: GET ${ZAI_QUOTA_ROUTE}`)
}
