/**
 * Browser half of the Z.AI (智谱) coding-plan quota: one ambient entry below
 * the composer card showing the plan's metering windows, rendered only while
 * the session's selected provider is Z.AI. The reading comes from the host
 * route in `@deepseek-ai/dsh-host-zai-quota`, which owns the credential and
 * the provider request.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ZaiQuotaController } from './controller.ts'
import { ZaiQuotaSection, type ZaiQuotaSectionInjected } from './ZaiQuotaSection.tsx'
import { en, NS, zh, type ZaiQuotaKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Coding-plan quota section copy. */
    'zai-quota': ZaiQuotaKey
  }
}

export type { ZaiQuotaSectionInjected, ZaiQuotaSectionProps } from './ZaiQuotaSection.tsx'
export type { ZaiQuotaState } from './controller.ts'

/** Required services: the slot registry, locale, and the model directory owner. */
export const inject = ['slots', 'locale', 'modelDirectories']

/**
 * Client plugin body: register the dictionaries and the composer dock's quota
 * entry over the shared per-session model directory.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new ZaiQuotaController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zai-quota: dictionaries')

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    scope.slots.inject('conversation.composer.dock', () => scope.slots.register({
      name: 'conversation.composer.dock',
      id: 'zai-quota',
      order: 0,
      locale: NS,
      inject: (sessionId): ZaiQuotaSectionInjected => ({
        hooks: { quota: controller.state },
        directory: scope.modelDirectories.directoryFor(sessionId).store,
        load: () => { void controller.load() },
      }),
    }, ZaiQuotaSection))
  })
}
