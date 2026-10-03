import { Button, Panel, TextField } from '@clairvoyant/ui'
import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { buildLoginUrl, normalizeHandle } from '../lib/handle'
import { navigateTo } from '../lib/navigate'
import { useMe } from '../lib/useMe'

export const LoginPage = () => {
  const me = useMe()
  const [handle, setHandle] = useState('')

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = normalizeHandle(handle)
    if (!trimmed) return
    navigateTo(buildLoginUrl(trimmed))
  }

  if (me.data) return <Navigate to="/events" replace />

  return (
    <Panel title="Link up" meta="Your records stay on your own PDS.">
      <form onSubmit={onSubmit} className="stack">
        <TextField
          label="Handle"
          name="handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="alice.bsky.social"
          autoComplete="username"
          required
        />
        <div className="cluster">
          <Button type="submit" variant="primary" pending={me.isLoading}>
            Link up
          </Button>
        </div>
      </form>
    </Panel>
  )
}
