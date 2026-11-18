import type { FormEvent } from 'react'
import { native } from '../native/bridge'
import type { Snapshot } from '../native/contract'
import { activeProfile } from '../state/presentation'

export function CharacterProfile({ settings, run }: {
  settings: Snapshot['settings']
  run: (task: () => Promise<void>) => void
}) {
  const current = activeProfile(settings)

  function selectProfile(value: string) {
    const profile = value === '' ? undefined : settings.profiles[Number(value)]
    run(() => native.campaignProfile(profile?.character ?? '', profile?.league ?? ''))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const character = String(fields.get('character') ?? '').trim()
    const league = String(fields.get('league') ?? '').trim()
    if (character) run(() => native.campaignProfile(character, league))
  }

  return <section className="field character-profile" aria-label="Campaign character">
    {settings.profiles.length > 0 && <label className="settings-field">Campaign character
      <select name="activeProfile" value={settings.activeProfile ?? ''} onChange={e => selectProfile(e.target.value)}>
        <option value="">No character selected</option>
        {settings.profiles.map((profile, index) => <option key={index} value={index}>
          {profile.character}{profile.league && ` · ${profile.league}`}
        </option>)}
      </select>
    </label>}
    <details open={current ? undefined : true}>
      <summary>Add or switch character</summary>
      <form className="profile-form" onSubmit={submit}>
        <label className="settings-field">Character name<input name="character" required maxLength={128}/></label>
        <label className="settings-field">League (optional)<input name="league" maxLength={128}/></label>
        <button type="submit">Use character</button>
      </form>
    </details>
  </section>
}
