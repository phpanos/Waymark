export function buildLabel(id: string, entries: Record<string, string> = {}) {
  if (Object.hasOwn(entries, id)) return entries[id]
  const canonical = id.replace('/Items/Gems/', '/Items/Gem/')
  if (Object.hasOwn(entries, canonical)) return entries[canonical]
  const key = id.split('/').pop() ?? id
  return key.replace(/^(?:SkillGem|SupportGem)/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2')
}
