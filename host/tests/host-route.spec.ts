/**
 * Quota route over a real WebServer booted through the vendored Loader (the
 * REAL-composition requirement): the connection trust fence, credential
 * resolution, the provider window mapping, every failure the route answers
 * with, and the successful-reading cache. The provider request is faked by a
 * global `fetch` stub that forwards this spec's own HTTP calls to the real
 * implementation; the connection service and the credential service are
 * controllable stubs (their real providers live in other compositions).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as ZaiQuota from '../src/index.ts'
import { ZAI_QUOTA_ROUTE } from '../src/shared.ts'

let root: string | undefined
let context: Context | undefined
/** Base URL of the booted server; this spec's own calls to it bypass the fetch stub. */
let serverBase: string | undefined
/** Answer the connection stub gives the route until a test changes it. */
const trust: { rejection: 401 | 403 | undefined } = { rejection: undefined }
/** What the credential stub resolves the configured reference to. */
const stored: { value: string | undefined } = { value: 'plan-secret' }
/** Every provider request the route made, in order. */
let upstream: { url: string; init: RequestInit | undefined }[] = []
/** The provider's answer for the next request. */
let provider: () => Promise<Response> = () => Promise.resolve(new Response('{}', { status: 200 }))
const realFetch = globalThis.fetch

/** The provider body the live endpoint answered at the time this mapping was written. */
const LIVE_BODY = JSON.stringify({
  code: 200,
  msg: '操作成功',
  data: {
    limits: [
      {
        type: 'CREDIT_LIMIT',
        unit: 3,
        number: 5,
        usage: 12000,
        currentValue: 11391,
        remaining: 608,
        percentage: 94,
        nextResetTime: 1789730474310,
      },
      {
        type: 'CREDIT_LIMIT',
        unit: 6,
        number: 1,
        usage: 60000,
        currentValue: 44597,
        remaining: 15402,
        percentage: 74,
        nextResetTime: 1790063833992,
      },
    ],
    level: 'pro',
  },
  success: true,
})

beforeEach(() => {
  upstream = []
  provider = () => Promise.resolve(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    // This spec's own calls to the booted server keep the real implementation;
    // everything else is the provider request under test.
    if (serverBase !== undefined && url.startsWith(serverBase)) return await realFetch(input, init)
    upstream.push({ url, init })
    return await provider()
  }))
})

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  serverBase = undefined
  trust.rejection = undefined
  stored.value = 'plan-secret'
  vi.unstubAllGlobals()
})

/**
 * Boot webserver + zai-quota rows through the real Loader.
 * @param cacheMs - reading-cache lifetime for this boot.
 * @param withCredentials - whether the composition carries the credential seam.
 * @returns The booted server's base URL.
 */
async function boot(cacheMs = 60_000, withCredentials = true): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-zai-quota-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-host-zai-quota'",
    '  config:',
    '    credentialRef: ZAI_CODING_CN_API_KEY',
    '    endpoint: https://open.bigmodel.cn/api/monitor/usage/quota/limit',
    '    timeoutMs: 5000',
    `    cacheMs: ${String(cacheMs)}`,
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  context.provide('connection', { requestRejection: () => trust.rejection } as never)
  if (withCredentials) {
    context.provide('credentials', {
      resolve: () => Promise.resolve(stored.value === undefined ? undefined : { value: stored.value, source: 'file' }),
    } as never)
  }
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-host-zai-quota', ZaiQuota],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  expect([...context.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
  serverBase = `http://127.0.0.1:${String(context.webServer.port)}`
  return serverBase
}

describe('zai-quota host route (real Loader composition)', () => {
  it('keeps the function-plugin runtime surface to Loader exports', () => {
    expect(Object.keys(ZaiQuota).sort()).toEqual(['Config', 'apply', 'inject', 'name'])
  })

  it('answers the connection rejection before resolving the credential', async () => {
    trust.rejection = 401
    const base = await boot()
    const refused = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(refused.status).toBe(401)
    expect(upstream).toEqual([])

    trust.rejection = 403
    expect((await fetch(`${base}${ZAI_QUOTA_ROUTE}`)).status).toBe(403)
  })

  it('answers 405 with the one supported method', async () => {
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`, { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(upstream).toEqual([])
  })

  it('answers 409 while no credential is stored', async () => {
    stored.value = undefined
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: 'no-credential',
      message: 'no credential stored for ZAI_CODING_CN_API_KEY',
    })
    expect(upstream).toEqual([])
  })

  it('answers 409 for a composition without the credential seam', async () => {
    const base = await boot(60_000, false)
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'no-credential' })
    expect(upstream).toEqual([])
  })

  it('reads the provider with the stored credential and maps its windows', async () => {
    provider = () => Promise.resolve(new Response(LIVE_BODY, { status: 200 }))
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      level: 'pro',
      windows: [
        { kind: 'rolling', limit: 12000, used: 11391, remaining: 608, percent: 94, resetsAt: 1789730474310 },
        { kind: 'weekly', limit: 60000, used: 44597, remaining: 15402, percent: 74, resetsAt: 1790063833992 },
      ],
    })
    expect(upstream).toHaveLength(1)
    expect(upstream[0]?.url).toBe('https://open.bigmodel.cn/api/monitor/usage/quota/limit')
    expect(upstream[0]?.init).toMatchObject({
      redirect: 'error',
      headers: { authorization: 'Bearer plan-secret', accept: 'application/json' },
    })
  })

  it('reuses one successful reading for the configured cache lifetime, then reads again', async () => {
    provider = () => Promise.resolve(new Response(LIVE_BODY, { status: 200 }))
    const base = await boot()
    expect((await fetch(`${base}${ZAI_QUOTA_ROUTE}`)).status).toBe(200)
    expect((await fetch(`${base}${ZAI_QUOTA_ROUTE}`)).status).toBe(200)
    expect(upstream).toHaveLength(1)
  })

  it('reads the provider again once the cache lifetime has passed', async () => {
    provider = () => Promise.resolve(new Response(LIVE_BODY, { status: 200 }))
    const base = await boot(0)
    await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(upstream).toHaveLength(2)
  })

  it('maps a provider HTTP failure and does not cache it', async () => {
    provider = () => Promise.resolve(new Response('{"error":"bad key"}', { status: 401 }))
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      code: 'upstream-failed',
      message: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit answered HTTP 401',
    })
    await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(upstream).toHaveLength(2)
  })

  it('maps an unreadable provider body', async () => {
    provider = () => Promise.resolve(new Response('<html>nope</html>', { status: 200 }))
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      code: 'upstream-failed',
      message: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit answered an unreadable body',
    })
  })

  it('maps an unreachable provider', async () => {
    provider = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      code: 'unreachable',
      message: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit: getaddrinfo ENOTFOUND',
    })
  })

  it('maps a thrown non-Error value', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a non-Error rejection is the scenario.
    provider = () => Promise.reject('socket closed')
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({
      code: 'unreachable',
      message: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit: socket closed',
    })
  })

  it('answers 502 for an envelope that carries no recognizable window', async () => {
    provider = () => Promise.resolve(new Response(JSON.stringify({ code: 200, success: true, data: { limits: [] } }), { status: 200 }))
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ code: 'upstream-failed' })
  })

  it('skips rows it cannot classify or read, keeps a monthly MCP row, and tolerates an absent level', async () => {
    provider = () => Promise.resolve(new Response(JSON.stringify({
      code: 200,
      success: true,
      data: {
        limits: [
          null,
          'row',
          { type: 'CREDIT_LIMIT', unit: 3, number: 5 },
          { type: 'CREDIT_LIMIT', unit: 9, number: 9, usage: 1, currentValue: 1, remaining: 0, percentage: 100, nextResetTime: 1 },
          { type: 'OTHER_LIMIT', unit: 3, number: 5, usage: 1, currentValue: 1, remaining: 0, percentage: 100, nextResetTime: 1 },
          { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 10, currentValue: 4, remaining: 6, percentage: 40, nextResetTime: 7 },
          { type: 'TIME_LIMIT', unit: 1, number: 30, usage: 100, currentValue: 1, remaining: 99, percentage: 1, nextResetTime: 8 },
        ],
      },
    }), { status: 200 }))
    const base = await boot()
    const response = await fetch(`${base}${ZAI_QUOTA_ROUTE}`)
    expect(await response.json()).toEqual({
      level: '',
      windows: [
        { kind: 'rolling', limit: 10, used: 4, remaining: 6, percent: 40, resetsAt: 7 },
        { kind: 'monthly', limit: 100, used: 1, remaining: 99, percent: 1, resetsAt: 8 },
      ],
    })
  })

  it.each([
    ['a non-object body', '"text"'],
    ['a failed envelope', JSON.stringify({ code: 500, success: false, data: { limits: [] } })],
    ['a missing data object', JSON.stringify({ code: 200, success: true })],
    ['a non-array limits field', JSON.stringify({ code: 200, success: true, data: { limits: {} } })],
  ])('answers 502 for %s', async (_name, body) => {
    provider = () => Promise.resolve(new Response(body, { status: 200 }))
    const base = await boot()
    expect((await fetch(`${base}${ZAI_QUOTA_ROUTE}`)).status).toBe(502)
  })

  it('removes the route when the Loader entry is disposed', async () => {
    provider = () => Promise.resolve(new Response(LIVE_BODY, { status: 200 }))
    const base = await boot()
    expect((await fetch(`${base}${ZAI_QUOTA_ROUTE}`)).status).toBe(200)
    const entry = [...context!.loader.entries()].find(candidate => candidate.options.name === '@deepseek-ai/dsh-host-zai-quota')
    expect(entry).toBeDefined()
    await entry!.fiber?.dispose()
    expect((await fetch(`${base}${ZAI_QUOTA_ROUTE}`)).status).toBe(404)
  })
})
