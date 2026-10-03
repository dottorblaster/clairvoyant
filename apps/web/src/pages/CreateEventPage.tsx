import { Button, Loading, Notice, Panel, TextArea, TextField } from '@clairvoyant/ui'
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
    onSuccess: async () => {
      // The event is not in the index until the indexer has seen it, so open the
      // list instead of the detail page
      await queryClient.invalidateQueries({ queryKey: ['my-events'] })
      navigate('/events')
    },
  })

  const update = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.startsAt) return

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
      <Panel title="New event">
        <Loading>Checking your save</Loading>
      </Panel>
    )
  }

  if (!me.data) {
    return (
      <Panel title="New event">
        <Notice tone="error">You need to link up before you can post an event.</Notice>
      </Panel>
    )
  }

  return (
    <Panel title="New event" meta="Saved to your own PDS.">
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
            Post event
          </Button>
        </div>

        {mutation.isError ? <Notice tone="error">Didn't take. Have another go.</Notice> : null}
      </form>
    </Panel>
  )
}
