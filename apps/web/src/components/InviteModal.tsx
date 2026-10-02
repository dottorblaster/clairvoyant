import { Button, Modal, Notice, TextField } from '@clairvoyant/ui'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'
import { createInvite } from '../lib/api'
import { buildInviteUrl, normalizeHandle } from '../lib/handle'

interface InviteModalProps {
  eventUri: string
  eventPath: string
  onClose: () => void
}

export const InviteModal = ({ eventUri, eventPath, onClose }: InviteModalProps) => {
  const [handle, setHandle] = useState('')
  const [inviteeHandle, setInviteeHandle] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const handleInputRef = useRef<HTMLInputElement>(null)

  const create = useMutation({
    mutationFn: (value: string) => createInvite(eventUri, value),
    onSuccess: (data) => {
      setInviteeHandle(data.inviteeHandle)
      setInviteUrl(buildInviteUrl(window.location.origin, eventPath, data.token))
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = normalizeHandle(handle)
    if (value) create.mutate(value)
  }

  const copy = () => {
    if (!inviteUrl) return
    const clipboard = navigator.clipboard
    if (!clipboard) return
    clipboard
      .writeText(inviteUrl)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1_500)
      })
      .catch(() => setCopied(false))
  }

  const reset = () => {
    setInviteUrl(null)
    setInviteeHandle('')
    setHandle('')
    create.reset()
  }

  return (
    <Modal title="Invite someone" onClose={onClose} initialFocusRef={handleInputRef}>
      {inviteUrl === null ? (
        <form onSubmit={submit} className="stack">
          <TextField
            ref={handleInputRef}
            label="Their handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="alice.bsky.social"
            autoComplete="off"
            hint="Resolved to a DID server-side, so the link only works for them."
            required
          />

          <div className="cluster">
            <Button type="submit" variant="primary" pending={create.isPending}>
              Generate invite link
            </Button>
          </div>

          {create.isError ? (
            <Notice tone="error">Could not create the invite. Check the handle and retry.</Notice>
          ) : null}
        </form>
      ) : (
        <div className="stack">
          <p>
            Invite link for <strong>@{inviteeHandle}</strong>. Only they can use it to RSVP.
          </p>

          <TextField
            label="Invite link"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.currentTarget.select()}
          />

          <div className="cluster">
            <Button variant="primary" icon={copied ? 'check' : undefined} onClick={copy}>
              {copied ? 'Copied' : 'Copy invite link'}
            </Button>
            <Button onClick={reset}>Invite someone else</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
