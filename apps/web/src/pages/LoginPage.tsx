import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMe } from '../lib/useMe'

export const LoginPage = () => {
  const me = useMe()
  const [handle, setHandle] = useState('')

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = handle.trim().replace(/^@/, '')
    if (!trimmed) return
    // Full-page redirect into the API's OAuth flow; the browser never sees tokens.
    window.location.assign(`/oauth/login?handle=${encodeURIComponent(trimmed)}`)
  }

  if (me.data) return <Navigate to="/events" replace />

  return (
    <section className="card">
      <h1>Log in with AT Protocol</h1>
      <p>Enter your handle (for example, alice.bsky.social).</p>
      <form onSubmit={onSubmit} className="stack">
        <label htmlFor="handle">Handle</label>
        <input
          id="handle"
          name="handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="alice.bsky.social"
          autoComplete="username"
          required
        />
        <button type="submit" disabled={me.isLoading}>
          Continue
        </button>
      </form>
    </section>
  )
}
