/** Reading state and host-route carrier: base resolution, success, and every failure it publishes. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZAI_QUOTA_ROUTE } from '@deepseek-ai/dsh-host-zai-quota/shared'
import { ZaiQuotaController } from '../src/client/controller.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status })
}

/** Recording fetcher: the carrier under test plus the request it received. */
function recordingFetcher(respond: () => Response = () => jsonResponse(PAYLOAD)) {
  return vi.fn(async (_input: string | URL, _init?: RequestInit) => respond())
}

const PAYLOAD = {
  level: 'pro',
  windows: [{ kind: 'rolling', limit: 12_000, used: 11_391, remaining: 608, percent: 94, resetsAt: 1 }],
}

describe('ZaiQuotaController', () => {
  it('starts on the loading placeholder', () => {
    const controller = new ZaiQuotaController(async () => jsonResponse(PAYLOAD))
    expect(controller.state.getSnapshot()).toEqual({ status: 'loading' })
  })

  it('publishes the host reading', async () => {
    const fetcher = recordingFetcher()
    const controller = new ZaiQuotaController(fetcher)
    await controller.load()
    expect(controller.state.getSnapshot()).toEqual({ status: 'ready', ...PAYLOAD })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`http://dsh.internal${ZAI_QUOTA_ROUTE}`)
  })

  it('resolves the route against the page origin when the page has one', async () => {
    vi.stubGlobal('location', { origin: 'http://dsh.example:8080' })
    const fetcher = recordingFetcher()
    await new ZaiQuotaController(fetcher).load()
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`http://dsh.example:8080${ZAI_QUOTA_ROUTE}`)
  })

  it('treats a null origin as the carrier fallback', async () => {
    vi.stubGlobal('location', { origin: 'null' })
    const fetcher = recordingFetcher()
    await new ZaiQuotaController(fetcher).load()
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`http://dsh.internal${ZAI_QUOTA_ROUTE}`)
  })

  it('shares one reading across concurrent loads and reads again after it settles', async () => {
    const fetcher = recordingFetcher()
    const controller = new ZaiQuotaController(fetcher)
    await Promise.all([controller.load(), controller.load()])
    expect(fetcher).toHaveBeenCalledOnce()
    await controller.load()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('publishes the host failure payload', async () => {
    const controller = new ZaiQuotaController(async () => jsonResponse({ code: 'no-credential', message: 'none' }, 409))
    await controller.load()
    expect(controller.state.getSnapshot()).toEqual({ status: 'failed', code: 'no-credential', message: 'none' })
  })

  it.each([
    ['an unknown failure code', { code: 'teapot', message: 'nope' }],
    ['a non-string message', { code: 'unreachable', message: 7 }],
    ['a non-object body', 'plain'],
  ])('falls back to the HTTP status for %s', async (_name, body) => {
    const controller = new ZaiQuotaController(async () => jsonResponse(body, 503))
    await controller.load()
    expect(controller.state.getSnapshot()).toEqual({
      status: 'failed',
      code: 'upstream-failed',
      message: 'HTTP 503',
    })
  })

  it('reports an undecodable failure body as the HTTP status', async () => {
    const controller = new ZaiQuotaController(async () => new Response('<html>', { status: 502 }))
    await controller.load()
    expect(controller.state.getSnapshot()).toEqual({
      status: 'failed',
      code: 'upstream-failed',
      message: 'HTTP 502',
    })
  })

  it('reports a transport failure as unreachable, keeping the thrown message', async () => {
    const controller = new ZaiQuotaController(() => Promise.reject(new Error('offline')))
    await controller.load()
    expect(controller.state.getSnapshot()).toEqual({ status: 'failed', code: 'unreachable', message: 'offline' })
  })

  it('reports a thrown non-Error value as unreachable', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a non-Error rejection is the scenario.
    const controller = new ZaiQuotaController(() => Promise.reject('socket closed'))
    await controller.load()
    expect(controller.state.getSnapshot()).toEqual({ status: 'failed', code: 'unreachable', message: 'socket closed' })
  })
})
