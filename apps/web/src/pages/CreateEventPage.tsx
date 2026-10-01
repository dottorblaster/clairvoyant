import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEvent } from '../lib/api'
import { useMe } from '../lib/useMe'

interface FormState {
  name: string
  startsAt: string
  endsAt: string
  description: string
}

const initialState: FormState = {
  name: '',
  startsAt: '',
  endsAt: '',
  description: '',
}

export const CreateEventPage = () => {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialState)

  const mutation = useMutation({
    mutationFn: createEvent,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['my-events'] })
      // at://<did>/<collection>/<rkey> -> readable /p/<did>/e/<rkey>
      const parts = result.uri.replace(/^at:\/\//, '').split('/')
      const did = parts[0]
      const rkey = parts[2]
      navigate(did && rkey ? `/p/${did}/e/${rkey}` : '/events')
    },
  })

  const update = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.startsAt) return

    // datetime-local values are local time; convert to the ISO strings the
    // lexicon expects.
    const startsAt = new Date(form.startsAt).toISOString()
    const input: Parameters<typeof createEvent>[0] = {
      name: form.name.trim(),
      startsAt,
    }
    if (form.endsAt) input.endsAt = new Date(form.endsAt).toISOString()
    if (form.description.trim()) input.description = form.description.trim()

    mutation.mutate(input)
  }

  if (me.isLoading) return <p>Loading…</p>
  if (!me.data) {
    return (
      <section className="card">
        <p>You need to log in before creating an event.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h1>Create event</h1>
      <p className="muted">
        The record is written to your PDS. It appears here once the indexer observes it.
      </p>
      <form onSubmit={onSubmit} className="stack">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={form.name}
          onChange={(event) => update('name')(event.target.value)}
          required
        />

        <label htmlFor="startsAt">Starts at</label>
        <input
          id="startsAt"
          type="datetime-local"
          value={form.startsAt}
          onChange={(event) => update('startsAt')(event.target.value)}
          required
        />

        <label htmlFor="endsAt">Ends at (optional)</label>
        <input
          id="endsAt"
          type="datetime-local"
          value={form.endsAt}
          onChange={(event) => update('endsAt')(event.target.value)}
        />

        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          value={form.description}
          onChange={(event) => update('description')(event.target.value)}
          rows={4}
        />

        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Create event'}
        </button>

        {mutation.isError && <p className="error">Could not create the event. Please retry.</p>}
      </form>
    </section>
  )
}
