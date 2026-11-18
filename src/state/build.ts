const maximumLevel = 100
export const maximumBuildBytes = 512 * 1024

type Range = [number, number]
type Entry = { id: string; range: Range; note: string }
export type Skill = Entry & { supports: Entry[] }
export type Passive = Entry & { weaponSet: number | null }
export type Gear = { slot: string; name: string; range: Range; note: string }
export type BuildGuide = {
  name: string
  author: string
  description: string
  ascendancy: string
  skills: Skill[]
  passives: Passive[]
  gear: Gear[]
}

export type BuildChange =
  | { kind: 'gem'; id: string }
  | { kind: 'support'; id: string; skillId: string }
  | { kind: 'gear'; item: Gear }
  | { kind: 'passive'; passive: Passive }

export type BuildMilestone = { level: number; changes: BuildChange[] }

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid build entry.')
  return value as Record<string, unknown>
}

function list(value: unknown): unknown[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('Invalid build list.')
  return value
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  const markup = /<(?:[rbiusml]|red|orange|yellow|green|blue|indigo|violet|black|white|grey|bronze|silver|gold|unique|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))>\{([^{}]*)\}/gi
  let text = value.replace(/\^(?:[0-9]|x[0-9a-f]{6})/gi, '')
  for (let depth = 0; depth < 8; depth++) {
    const plain = text.replace(markup, '$1')
    if (plain === text) break
    text = plain
  }
  return text.trim()
}

function range(value: unknown): Range {
  if (value == null) return [0, maximumLevel]
  const pair = Array.isArray(value) ? value : [value, value]
  if (pair.length !== 2 || pair.some(level => !Number.isInteger(level) || level < 0 || level > maximumLevel) ||
      pair[0] > pair[1]) throw new Error('Invalid level interval.')
  return [pair[0], pair[1]]
}

function entry(data: Record<string, unknown>): Entry {
  const id = clean(data.id)
  if (!id) throw new Error('A skill or passive is missing its ID.')
  return { id, range: range(data.level_interval), note: clean(data.additional_text) }
}

function readEntry(value: unknown) {
  return typeof value === 'string' ? { id: value } : record(value)
}

export function parseBuild(source: string): BuildGuide {
  const data = record(JSON.parse(source) as unknown)
  const name = clean(data.name)
  if (!name) throw new Error('The build is missing its name.')
  const skills = list(data.skills).map(value => {
    const skill = readEntry(value)
    return { ...entry(skill), supports: list(skill.support_skills).map(support => entry(readEntry(support))) }
  })
  const passives = list(data.passives).map(value => {
    const passive = readEntry(value)
    const weaponSet = passive.weapon_set
    return { ...entry(passive), weaponSet: typeof weaponSet === 'number' && weaponSet > 0 ? weaponSet : null }
  })
  const gear = list(data.inventory_slots).map(value => {
    const item = record(value)
    const slot = clean(item.inventory_id)
    if (!slot) throw new Error('A gear entry is missing its inventory slot.')
    return { slot, name: clean(item.unique_name), range: range(item.level_interval), note: clean(item.additional_text) }
  })
  if (!skills.length && !passives.length && !gear.length && !clean(data.description)) {
    throw new Error('This file contains no build guidance.')
  }
  return { name, skills, passives, gear, author: clean(data.author), description: clean(data.description), ascendancy: clean(data.ascendancy) }
}

function atLevel({ range: [first, last] }: { range: Range }, level: number) {
  return first <= level && level <= last
}

function* scheduledChanges(build: BuildGuide): Generator<[number, BuildChange]> {
  for (const skill of build.skills) {
    yield [skill.range[0], { kind: 'gem', id: skill.id }]
    for (const support of skill.supports) {
      const start = Math.max(support.range[0], skill.range[0])
      if (start <= Math.min(support.range[1], skill.range[1])) {
        yield [start, { kind: 'support', id: support.id, skillId: skill.id }]
      }
    }
  }
  for (const item of build.gear) yield [item.range[0], { kind: 'gear', item }]
  for (const passive of build.passives) yield [passive.range[0], { kind: 'passive', passive }]
}

export function nextBuildMilestone(build: BuildGuide, level: number): BuildMilestone | null {
  let next: BuildMilestone | null = null
  for (const [start, change] of scheduledChanges(build)) {
    if (start <= level) continue
    if (!next || start < next.level) next = { level: start, changes: [change] }
    else if (start === next.level) next.changes.push(change)
  }
  return next
}

export function guidanceAtLevel(build: BuildGuide, level: number) {
  return {
    skills: build.skills.filter(skill => atLevel(skill, level)).map(skill => ({
      ...skill, supports: skill.supports.filter(support => atLevel(support, level)),
    })),
    gear: build.gear.filter(item => atLevel(item, level)),
    passives: build.passives.filter(passive => atLevel(passive, level)),
    nextLevel: nextBuildMilestone(build, level)?.level ?? null,
  }
}
