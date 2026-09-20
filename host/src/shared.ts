/**
 * Route path and wire payloads shared verbatim by the host route and the
 * browser package (`@deepseek-ai/dsh-client-ui-zai-quota`), published as the
 * `./shared` subpath. Browser-safe: constants and types only.
 */

/** GET route serving the resolved coding-plan quota. */
export const ZAI_QUOTA_ROUTE = '/zai-quota/usage'

/** One metering window of a coding plan. */
export interface ZaiQuotaWindow {
  /** Which allowance the provider meters: the 5-hour window, the weekly window, or a monthly MCP window. */
  readonly kind: 'rolling' | 'weekly' | 'monthly'
  /** Allowance for the window, in the provider's credit unit. */
  readonly limit: number
  /** Allowance already consumed. */
  readonly used: number
  /** Allowance still available. */
  readonly remaining: number
  /** Consumed percentage as the provider reports it, 0-100. */
  readonly percent: number
  /** Epoch milliseconds at which the window resets. */
  readonly resetsAt: number
}

/** Quota-route success payload. */
export interface ZaiQuotaPayload {
  /** Plan tier the provider reported, for example `pro`; empty when unreported. */
  readonly level: string
  /** Metering windows in provider order. */
  readonly windows: readonly ZaiQuotaWindow[]
}

/** Why the quota route could not answer with a reading. */
export type ZaiQuotaFailure = 'no-credential' | 'unreachable' | 'upstream-failed'

/** Quota-route failure payload; never carries the credential or a provider body. */
export interface ZaiQuotaErrorPayload {
  /** Machine discriminant of the failure. */
  readonly code: ZaiQuotaFailure
  /** Operator-facing detail. */
  readonly message: string
}
