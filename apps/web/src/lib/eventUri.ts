import { EVENT_COLLECTION } from '@clairvoyant/lexicons'

export const buildEventUri = (did: string, rkey: string): string =>
  `at://${did}/${EVENT_COLLECTION}/${rkey}`

export const buildEventPath = (did: string, rkey: string): string => `/p/${did}/e/${rkey}`

export interface EventUriParts {
  did: string
  rkey: string
}

export const parseEventUri = (uri: string): EventUriParts | null => {
  const parts = uri.replace(/^at:\/\//, '').split('/')
  const did = parts[0]
  const rkey = parts[2]
  return did && rkey ? { did, rkey } : null
}

export const rkeyFromUri = (uri: string): string => uri.split('/').pop() ?? ''
