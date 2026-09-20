/**
 * Browser-half lifecycle over the real SlotRegistry: the dictionary and
 * composer-dock registrations with fiber teardown proving removal (HMR
 * safety), and the injected controller face.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { apply, inject, type ZaiQuotaSectionInjected } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { ZaiQuotaSection } from '../src/client/ZaiQuotaSection.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A model directory stub whose per-session store never changes. */
const directoryStore = {
  subscribe: () => () => { /* no selection changes in this bench */ },
  getSnapshot: () => ({ current: { provider: 'zai-coding-cn', model: 'glm-5.3' } }),
}

/** Boot the browser half over a real slot tree that declares the composer dock. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.composer.dock': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('modelDirectories', { directoryFor: () => ({ store: directoryStore }) })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

/** Registered cell ids under the composer-dock slot. */
function sectionIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.composer.dock').map(entry => entry.options.id)
}

describe('zai-quota browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'modelDirectories'])
  })

  it('has no host-side behavior', () => {
    nodeApply()
    expect(nodeApply).toHaveLength(0)
  })

  it('registers the section, and fiber teardown removes it (HMR safety)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('conversation.composer.dock')[0]
    expect(entry?.component).toBe(ZaiQuotaSection)
    expect(entry?.options).toMatchObject({ id: 'zai-quota' })
    await fiber.dispose()
    expect(sectionIds(ctx)).not.toContain('zai-quota')
  })

  it('injects the reading source, the session model directory, and a load carrier that reads the host route', async () => {
    const fetcher = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ level: 'pro', windows: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const { ctx } = await bench()
    const entry = ctx.slots.entries('conversation.composer.dock')[0]
    const injected = (entry?.inject as unknown as () => ZaiQuotaSectionInjected)()
    expect(injected.hooks.quota.getSnapshot()).toEqual({ status: 'loading' })
    expect(injected.directory).toBe(directoryStore)
    injected.load()
    await vi.waitFor(() => {
      expect(injected.hooks.quota.getSnapshot()).toEqual({ status: 'ready', level: 'pro', windows: [] })
    })
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/zai-quota/usage')
  })
})
