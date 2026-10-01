import { Button, Loading, Notice, Panel, TextArea, TextField } from '@clairvoyant/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEvent } from '../lib/api'
import { buildEventPath, parseEventUri } from '../lib/eventUri'
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
      const parsed = parseEventUri(result.uri)
      navigate(parsed ? buildEventPath(parsed.did, parsed.rkey) : '/events')
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

  if (me.isLoading) {
    return (
      <Panel title="Create event">
        <Loading>Checking session</Loading>
      </Panel>
    )
  }

  if (!me.data) {
    return (
      <Panel title="Create event">
        <Notice tone="error">You need to log in before creating an event.</Notice>
      </Panel>
    )
  }

  return (
    <Panel
      title="Create event"
      meta="The record is written to your PDS. It appears here once the indexer observes it."
    >
      <form onSubmit={onSubmit} className="stack">
        <TextField
          label="Name"
          value={form.name}
          onChange={(event) => update('name')(event.target.value)}
          required
        />

        <TextField
          label="Starts at"
          type="datetime-local"
          value={form.startsAt}
          onChange={(event) => update('startsAt')(event.target.value)}
          required
        />

        <TextField
          label="Ends at (optional)"
          type="datetime-local"
          value={form.endsAt}
          onChange={(event) => update('endsAt')(event.target.value)}
        />

        <TextArea
          label="Description (optional)"
          value={form.description}
          onChange={(event) => update('description')(event.target.value)}
          rows={4}
        />

        <div className="cluster">
          <Button type="submit" variant="primary" pending={mutation.isPending}>
            Create event
          </Button>
        </div>

        {mutation.isError ? (
          <Notice tone="error">Could not create the event. Please retry.</Notice>
        ) : null}
      </form>
    </Panel>
  )
}
