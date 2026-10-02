export const EVENT_COLLECTION = 'community.lexicon.calendar.event'
export const RSVP_COLLECTION = 'community.lexicon.calendar.rsvp'

export const INDEXED_COLLECTIONS = [EVENT_COLLECTION, RSVP_COLLECTION] as const

export type IndexedCollection = (typeof INDEXED_COLLECTIONS)[number]

export const isIndexedCollection = (value: string): value is IndexedCollection =>
  (INDEXED_COLLECTIONS as readonly string[]).includes(value)
