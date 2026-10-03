import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { installFetchStub, renderWithProviders } from '../../test/render'
import { InviteModal } from './InviteModal'

const EVENT_URI = 'at://did:plc:author/community.lexicon.calendar.event/abc'
const EVENT_PATH = '/p/did:plc:author/e/abc'

const installClipboard = (): ReturnType<typeof vi.fn> => {
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
})

const render = (onClose = () => {}) =>
  renderWithProviders(<InviteModal eventUri={EVENT_URI} eventPath={EVENT_PATH} onClose={onClose} />)

describe('InviteModal', () => {
  test('mints an invite link bound to the resolved handle', async () => {
    const { calls } = installFetchStub([
      {
        path: `/api/events/${encodeURIComponent(EVENT_URI)}/invites`,
        method: 'POST',
        status: 201,
        body: {
          token: 'tok',
          eventUri: EVENT_URI,
          inviteeHandle: 'invitee.test',
          inviteeDid: 'did:plc:invitee',
          inviterHandle: 'viewer.test',
        },
      },
    ])

    render()
    fireEvent.change(screen.getByLabelText('Their handle'), {
      target: { value: ' @invitee.test ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make invite link' }))

    expect(await screen.findByText(/only they can open it/i)).toBeTruthy()
    const link = screen.getByLabelText('Invite link') as HTMLInputElement
    expect(link.value).toBe(`${window.location.origin}${EVENT_PATH}?invite=tok`)
    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual({ handle: 'invitee.test' })
  })

  test('copies the link to the clipboard', async () => {
    const writeText = installClipboard()
    installFetchStub([
      {
        path: `/api/events/${encodeURIComponent(EVENT_URI)}/invites`,
        method: 'POST',
        status: 201,
        body: {
          token: 'tok',
          eventUri: EVENT_URI,
          inviteeHandle: 'invitee.test',
          inviteeDid: 'd',
          inviterHandle: 'v',
        },
      },
    ])

    render()
    fireEvent.change(screen.getByLabelText('Their handle'), { target: { value: 'invitee.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make invite link' }))
    await screen.findByRole('button', { name: 'Copy link' })

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0]?.[0]).toContain(`${EVENT_PATH}?invite=tok`)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  test('lets the user start over with a new invite', async () => {
    installFetchStub([
      {
        path: `/api/events/${encodeURIComponent(EVENT_URI)}/invites`,
        method: 'POST',
        status: 201,
        body: {
          token: 'tok',
          eventUri: EVENT_URI,
          inviteeHandle: 'invitee.test',
          inviteeDid: 'd',
          inviterHandle: 'v',
        },
      },
    ])

    render()
    fireEvent.change(screen.getByLabelText('Their handle'), { target: { value: 'invitee.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make invite link' }))
    await screen.findByRole('button', { name: 'Invite someone else' })

    fireEvent.click(screen.getByRole('button', { name: 'Invite someone else' }))

    expect(screen.getByLabelText('Their handle')).toBeTruthy()
  })

  test('reports a failed invite', async () => {
    installFetchStub([
      {
        path: `/api/events/${encodeURIComponent(EVENT_URI)}/invites`,
        method: 'POST',
        status: 400,
        body: { error: 'handle_not_found' },
      },
    ])

    render()
    fireEvent.change(screen.getByLabelText('Their handle'), { target: { value: 'nobody.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make invite link' }))

    expect(await screen.findByText(/that handle didn't go through/i)).toBeTruthy()
  })
})
