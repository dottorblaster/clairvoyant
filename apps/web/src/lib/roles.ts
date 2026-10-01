import type { BadgeTone } from '@clairvoyant/ui'
import type { MyEventRole, RsvpStatus } from './api'

/** Hosting is the loudest, interested the quietest. */
export const ROLE_TONE: Record<MyEventRole, BadgeTone> = {
  hosting: 'ink',
  going: 'default',
  interested: 'muted',
}

/** The copy shown after a successful RSVP. */
export const RESPONSE_LABEL: Record<RsvpStatus, string> = {
  going: 'accepted',
  notgoing: 'declined',
  interested: 'interested',
}

/**
 * The index stores RSVP status verbatim from the network, so it is either the
 * bare name or the full ref (`community.lexicon.calendar.rsvp#going`). The API
 * normalises it into `status_name`; this maps that to a tone.
 */
export const rsvpTone = (name: RsvpStatus | null): BadgeTone => {
  if (name === 'going') return 'ink'
  if (name === 'notgoing') return 'muted'
  return 'default'
}
