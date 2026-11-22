export type GemVariant = { label: string; skills: string[]; supports: [string, string | null][] }
export type GemGuide = { name: string; variants: GemVariant[] }
export type GemCut = { id: string; name: string; skill?: string | null }

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function name(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180
}

export function parseGemGuide(value: unknown): GemGuide | undefined {
  const guide = object(value)
  if (!guide || !name(guide.name) || !Array.isArray(guide.variants) || guide.variants.length > 30) return
  const variants = guide.variants.flatMap(value => {
    const variant = object(value)
    if (!variant || !name(variant.label) || !Array.isArray(variant.skills) || !Array.isArray(variant.supports)) return []
    const skills = variant.skills.filter(name).slice(0, 60)
    const supports: GemVariant['supports'] = variant.supports.slice(0, 100).flatMap(item =>
      Array.isArray(item) && name(item[0]) && (item[1] === null || name(item[1])) ? [[item[0], item[1]]] : [])
    return skills.length || supports.length ? [{ label: variant.label, skills, supports }] : []
  })
  if (variants.length) return { name: guide.name, variants }
}

export function mobalyticsUrl(input: string): string {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new Error('Paste a public Mobalytics Path of Exile 2 build link.') }
  if (url.protocol !== 'https:' || !['mobalytics.gg', 'www.mobalytics.gg'].includes(url.hostname) ||
      url.username || url.password || url.port ||
      !/^\/poe-2\/(?:profile\/[\w-]{1,150}\/)?builds\/[\w-]{1,150}\/?$/.test(url.pathname)) {
    throw new Error('Paste a public Mobalytics Path of Exile 2 build link.')
  }
  return 'https://mobalytics.gg' + url.pathname.replace(/\/$/, '')
}

export function gemVariantIndex(guide: GemGuide, level: number) {
  let index = 0
  let best = 0
  guide.variants.forEach(({ label }, candidate) => {
    const range = /\b(?:lv|lvl|levels?)\.?\s*(\d{1,3})\b/i.exec(label) ?? /^\s*(\d{1,3})\s*[-–+]/.exec(label)
    const start = Number(range?.[1])
    if (start > best && start <= level) {
      best = start
      index = candidate
    }
  })
  return index
}

export function gemQueue(variant: GemVariant, cut: readonly string[]) {
  const copies = new Map<string, number>()
  const add = (kind: string, name: string, skill?: string | null): GemCut => {
    const key = name.toLowerCase()
    const copy = (copies.get(kind + key) ?? 0) + 1
    copies.set(kind + key, copy)
    return { id: JSON.stringify([kind, key, copy]), name, skill }
  }
  return {
    gems: variant.skills.map(name => add('gem', name)).filter(gem => !cut.includes(gem.id)),
    supports: variant.supports.map(([name, skill]) => add('support', name, skill)).filter(gem => !cut.includes(gem.id)),
  }
}
