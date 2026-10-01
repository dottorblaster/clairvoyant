import { EVENT_COLLECTION } from '@clairvoyant/lexicons'

/** `at://<did>/<collection>/<rkey>` for a calendar event. */
export const buildEventUri = (did: string, rkey: string): string =>
  `at://${did}/${EVENT_COLLECTION}/${rkey}`

/** The human-readable route for an event: `/p/<did>/e/<rkey>`. */
export const buildEventPath = (did: string, rkey: string): string => `/p/${did}/e/${rkey}`

export interface EventUriParts {
  did: string
  rkey: string
}

/**
 * Parse `at://<did>/<collection>/<rkey>` into the parts the app routes on.
 * Returns `null` when the URI does not carry a did and an rkey.
 */
export const parseEventUri = (uri: string): EventUriParts | null => {
  const parts = uri.replace(/^at:\/\//, '').split('/')
  const did = parts[0]
  const rkey = parts[2]
  return did && rkey ? { did, rkey } : null
}

/** The rkey at the end of an AT-URI, for building list links. */
export const rkeyFromUri = (uri: string): string => uri.split('/').pop() ?? ''
