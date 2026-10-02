import type { BadgeTone } from '@clairvoyant/ui'
import type { MyEventRole, RsvpStatus } from './api'

export const ROLE_TONE: Record<MyEventRole, BadgeTone> = {
  hosting: 'ink',
  going: 'default',
  interested: 'muted',
}

export const RESPONSE_LABEL: Record<RsvpStatus, string> = {
  going: 'accepted',
  notgoing: 'declined',
  interested: 'interested',
}

export const rsvpTone = (name: RsvpStatus | null): BadgeTone => {
  if (name === 'going') return 'ink'
  if (name === 'notgoing') return 'muted'
  return 'default'
}
