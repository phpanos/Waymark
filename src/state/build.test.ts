import { describe, expect, it } from 'vitest'
import { guidanceAtLevel, nextBuildMilestone, parseBuild } from './build'
import labels from '../data/build-labels.json'

describe('.build exports', () => {
  const form = {
    name: 'Campaign build',
    author: 'Fixture author',
    description: '^2Upgrade your <b>{<red>{weapon}}.',
    skills: [
      'Metadata/Items/Gem/SkillGemArchmage',
      { id: 'SkillGemRollingSlam', level_interval: [1, 20], support_skills: [
        'SupportGemHeavySwing',
        { id: 'SupportGemRuthless', level_interval: [5, 20], additional_text: 'Equip at level 5.' },
        { id: 'SupportGemIllegalRange', level_interval: [30, 40] },
      ] },
    ],
    passives: ['accuracy1', { id: 'accuracy2', level_interval: 15, weapon_set: 2 }],
    inventory_slots: [
      { inventory_id: 'Weapon', level_interval: [8, 20], additional_text: 'Look for physical damage.' },
      { inventory_id: 'Weapon', level_interval: [21, 100], unique_name: 'Fixture unique' },
    ],
  }

  it('loads skill, passive and gear instructions from a local export', () => {
    const guide = parseBuild(JSON.stringify(form))
    expect(guide.description).toBe('Upgrade your weapon.')
    expect(guide.skills).toHaveLength(2)
    expect(labels.gems['Metadata/Items/Gem/SkillGemArchmage']).toBe('Archmage')
    expect(labels.passives.accuracy1).toBe('Accuracy')
    expect(guide.gear[0].note).toBe('Look for physical damage.')
  })

  it('includes endpoints and links each support only while its parent skill is active', () => {
    const guide = parseBuild(JSON.stringify(form))
    expect(guidanceAtLevel(guide, 4)).toMatchObject({ nextLevel: 5, gear: [] })
    expect(guidanceAtLevel(guide, 4).skills[1].supports.map(support => support.id)).toEqual(['SupportGemHeavySwing'])
    expect(guidanceAtLevel(guide, 15).passives[1]).toMatchObject({ id: 'accuracy2', weaponSet: 2 })
    expect(guidanceAtLevel(guide, 16).passives).toHaveLength(1)
    expect(guidanceAtLevel(guide, 20).skills[1].supports).toHaveLength(2)
    expect(guidanceAtLevel(guide, 21)).toMatchObject({ gear: [{ name: 'Fixture unique' }], nextLevel: null })
    expect(guidanceAtLevel(guide, 21).skills).toHaveLength(1)
  })

  it('rejects malformed and unrelated files', () => {
    expect(() => parseBuild('<PathOfBuilding />')).toThrow()
    expect(() => parseBuild(JSON.stringify({ name: 'Nothing' }))).toThrow('no build guidance')
    expect(() => parseBuild(JSON.stringify({ ...form, skills: [{ id: 'skill', level_interval: [12, 4] }] }))).toThrow('level interval')
    expect(() => parseBuild(JSON.stringify({ ...form, passives: {} }))).toThrow('build list')
  })

  it('advances through support, gear and passive changes as the level moves past them', () => {
    const guide = parseBuild(JSON.stringify(form))
    expect(nextBuildMilestone(guide, 4)).toMatchObject({
      level: 5, changes: [{ kind: 'support', id: 'SupportGemRuthless', skillId: 'SkillGemRollingSlam' }],
    })
    expect(nextBuildMilestone(guide, 5)).toMatchObject({ level: 8, changes: [{ kind: 'gear', item: { slot: 'Weapon' } }] })
    expect(nextBuildMilestone(guide, 14)).toMatchObject({ level: 15, changes: [{ kind: 'passive', passive: { weaponSet: 2 } }] })
    expect(nextBuildMilestone(guide, 21)).toBeNull()
  })

  it('groups changes at the same level and applies the parent skill range to its supports', () => {
    const guide = parseBuild(JSON.stringify({
      name: 'Grouped build',
      skills: [{ id: 'SkillGemRollingSlam', level_interval: [12, 20], support_skills: [
        { id: 'SupportGemHeavySwing', level_interval: [3, 15] },
        { id: 'SupportGemRuthless', level_interval: [21, 100] },
      ] }],
      passives: [{ id: 'accuracy1', level_interval: 12 }],
    }))
    expect(nextBuildMilestone(guide, 11)).toMatchObject({
      level: 12, changes: [{ kind: 'gem' }, { kind: 'support', id: 'SupportGemHeavySwing' }, { kind: 'passive' }],
    })
    expect(nextBuildMilestone(guide, 12)).toBeNull()
    expect(nextBuildMilestone(parseBuild('{"name":"Unscheduled","skills":["SkillGemRollingSlam"]}'), 1)).toBeNull()
  })
})
