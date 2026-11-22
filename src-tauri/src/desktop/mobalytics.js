(() => {
  const marker = 'window.__PRELOADED_STATE__='
  const script = [...document.scripts].find(item => item.textContent.includes(marker))
  if (!script || script.textContent.length > 8 * 1024 * 1024) return null
  let state
  try {
    const source = script.textContent.slice(script.textContent.indexOf(marker) + marker.length)
    state = JSON.parse(source.trim().replace(/;$/, ''))
  } catch {
    return null
  }

  const labels = new Map()
  for (const tab of document.querySelectorAll('[role="tab"][data-key]')) {
    if (!labels.has(tab.dataset.key)) labels.set(tab.dataset.key, tab.textContent.trim())
  }
  const pending = [state]
  while (pending.length) {
    const item = pending.pop()
    if (!item || typeof item !== 'object') continue
    if (typeof item.name === 'string' && Array.isArray(item.buildVariants?.values)) {
      return {
        name: item.name,
        variants: item.buildVariants.values.slice(0, 30).map((variant, index) => {
          const slots = Array.isArray(variant.skillGems?.gems) ? variant.skillGems.gems : []
          const skills = slots.filter(slot => slot?.activeSkill?.name && !slot.grantedByWeaponSet)
            .map(slot => slot.activeSkill)
          const priorities = Array.isArray(variant.skillGems?.priorityGems) ? variant.skillGems.priorityGems : []
          const orderedSkills = priorities.filter(gem => gem?.gemType !== 'SUPPORT')
            .flatMap(gem => skills.filter(skill => skill.gemSlug === gem?.gemSlug))
          const names = new Map(skills.map(skill => [skill.gemSlug, skill.name]))
          return {
            label: labels.get(variant.id) || variant.name || `Variant ${index + 1}`,
            skills: [...new Set([...orderedSkills, ...skills].map(skill => skill.name))],
            supports: priorities.filter(gem => gem?.gemType === 'SUPPORT' && gem.name)
              .map(gem => [gem.name, names.get(gem.parentActiveSkillGemSlug) ?? null]),
          }
        }),
      }
    }
    for (const value of Object.values(item)) {
      if (value && typeof value === 'object') pending.push(value)
    }
  }
  return null
})()
