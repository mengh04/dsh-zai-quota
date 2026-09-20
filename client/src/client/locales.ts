/** `zai-quota` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'zai-quota'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'quota.title': '智谱编程套餐',
  'quota.loading': '正在查询额度…',
  'quota.retry': '重试',
  'quota.window.rolling': '5 小时额度',
  'quota.window.weekly': '每周额度',
  'quota.window.monthly': '每月额度',
  'quota.windowDetail': '剩余 {remaining} / {limit}',
  'quota.remainingPercent': '已用 {percent}%',
  'quota.resetsIn': '{duration}后重置',
  'quota.duration.minutes': '{value} 分钟',
  'quota.duration.hours': '{value} 小时',
  'quota.duration.days': '{value} 天',
  'quota.error.noCredential': '未配置该套餐的 API Key',
  'quota.error.unreachable': '无法连接智谱服务',
  'quota.error.upstreamFailed': '智谱未返回可识别的额度',
} as const

/** Key domain of the `zai-quota` namespace (zh is the source of truth). */
export type ZaiQuotaKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<ZaiQuotaKey, string> = {
  'quota.title': 'Z.ai coding plan',
  'quota.loading': 'Reading quota…',
  'quota.retry': 'Retry',
  'quota.window.rolling': '5-hour quota',
  'quota.window.weekly': 'Weekly quota',
  'quota.window.monthly': 'Monthly quota',
  'quota.windowDetail': '{remaining} of {limit} left',
  'quota.remainingPercent': '{percent}% used',
  'quota.resetsIn': 'resets in {duration}',
  'quota.duration.minutes': '{value} min',
  'quota.duration.hours': '{value} h',
  'quota.duration.days': '{value} d',
  'quota.error.noCredential': 'No API key stored for this plan',
  'quota.error.unreachable': 'Cannot reach Z.ai',
  'quota.error.upstreamFailed': 'Z.ai returned no recognizable quota',
}
