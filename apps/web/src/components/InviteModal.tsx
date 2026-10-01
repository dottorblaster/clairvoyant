import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createInvite } from '../lib/api'

interface InviteModalProps {
  eventUri: string
  /** Readable event path, e.g. `/p/<did>/e/<rkey>`. */
  eventPath: string
  onClose: () => void
}

/**
 * Modal that mints a per-person invite. The recipient's handle is resolved to a
 * DID server-side and baked into the token, so the link only works for them.
 */
export const InviteModal = ({ eventUri, eventPath, onClose }: InviteModalProps) => {
  const [handle, setHandle] = useState('')
  const [inviteeHandle, setInviteeHandle] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const create = useMutation({
    mutationFn: (value: string) => createInvite(eventUri, value),
    onSuccess: (data) => {
      setInviteeHandle(data.inviteeHandle)
      setInviteUrl(`${window.location.origin}${eventPath}?invite=${data.token}`)
    },
  })

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = handle.trim().replace(/^@/, '')
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
    <div className="modal-root">
      <button
        type="button"
        className="modal-overlay"
        aria-label="Close invite dialog"
        onClick={onClose}
      />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
        <div className="modal-header">
          <h2 id="invite-modal-title">Invite someone</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {inviteUrl ? (
          <div className="stack">
            <p>
              Invite link for <strong>@{inviteeHandle}</strong>. Only they can use it to RSVP.
            </p>
            <input
              aria-label="Invite link"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" onClick={copy}>
              {copied ? 'Copied!' : 'Copy invite link'}
            </button>
            <button type="button" onClick={reset}>
              Invite someone else
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <label htmlFor="inviteHandle">Their handle</label>
            <input
              id="inviteHandle"
              ref={inputRef}
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="alice.bsky.social"
              autoComplete="off"
              required
            />
            <button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Generating…' : 'Generate invite link'}
            </button>
            {create.isError && (
              <p className="error">Could not create the invite. Check the handle and retry.</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
