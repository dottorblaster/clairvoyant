/**
 * Read the human-facing fields out of a raw `community.lexicon.calendar.event`
 * record.
 *
 * The indexer projects `name`, `starts_at` and `ends_at` to columns; this module
 * does the same for `description` and `locations` so the rest of the app never
 * has to reach into `raw`. `parseEventDetails` is used at index time to split
 * the record, and `formatEventLocations` turns the stored `locations` union back
 * into display lines for the browser.
 *
 * It is deliberately a permissive *reader*, not a validator: the indexer already
 * validated the record against the lexicon before writing it, so here we only
 * need to cope defensively with a partial or malformed value and degrade to
 * "nothing to show" instead of throwing. Escaping is the renderer's job; the
 * strings and structured values are returned verbatim.
 */

const EVENT_URI_TYPE = 'community.lexicon.calendar.event#uri'
const ADDRESS_TYPE = 'community.lexicon.location.address'
const FSQ_TYPE = 'community.lexicon.location.fsq'
const GEO_TYPE = 'community.lexicon.location.geo'
const HTHREE_TYPE = 'community.lexicon.location.hthree'

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** A trimmed, non-empty string, or `null`. */
const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface EventDetails {
  /** The record's `description`, trimmed, or `null` when absent/blank. */
  description: string | null
  /**
   * The record's `locations` union members, in order. Objects only; anything
   * else in the array is dropped. This is what gets stored in the JSONB column.
   */
  locations: unknown[]
}

const EMPTY_DETAILS: EventDetails = { description: null, locations: [] }

/** Split a raw event record into the fields the index promotes to columns. */
export const parseEventDetails = (raw: unknown): EventDetails => {
  const record = asRecord(raw)
  if (record === null) return EMPTY_DETAILS

  const locations = Array.isArray(record.locations)
    ? record.locations.filter((value) => asRecord(value) !== null)
    : []

  return { description: text(record.description), locations }
}

/**
 * One display line for a `locations` union member.
 *
 * `$type` is the primary discriminator, but it is optional on every member of
 * the union, so when it is absent we fall back to the shape of the object. Order
 * matters: `country` identifies an address, `value` an H3 cell, `uri` an event
 * URI, and a latitude/longitude pair a coordinate.
 */
const formatLocation = (value: unknown): string | null => {
  const record = asRecord(value)
  if (record === null) return null

  const type = typeof record.$type === 'string' ? record.$type : null
  const name = text(record.name)

  if (type === EVENT_URI_TYPE || (type === null && text(record.uri) !== null)) {
    const uri = text(record.uri)
    if (uri === null) return null
    return name ?? uri
  }

  if (type === ADDRESS_TYPE || (type === null && text(record.country) !== null)) {
    const parts = [
      name,
      text(record.street),
      text(record.locality),
      text(record.region),
      text(record.postalCode),
      text(record.country),
    ].filter((part): part is string => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
  }

  if (
    type === GEO_TYPE ||
    type === FSQ_TYPE ||
    (type === null && text(record.latitude) !== null && text(record.longitude) !== null)
  ) {
    const latitude = text(record.latitude)
    const longitude = text(record.longitude)
    const coordinates = latitude !== null && longitude !== null ? `${latitude}, ${longitude}` : null
    if (name !== null && coordinates !== null) return `${name} (${coordinates})`
    return name ?? coordinates
  }

  if (type === HTHREE_TYPE || (type === null && text(record.value) !== null)) {
    return name ?? text(record.value)
  }

  return name
}

/** Turn a stored `locations` value into display lines, de-duplicated. */
export const formatEventLocations = (locations: unknown): string[] => {
  if (!Array.isArray(locations)) return []

  const lines: string[] = []
  const seen = new Set<string>()
  for (const value of locations) {
    const label = formatLocation(value)
    if (label !== null && !seen.has(label)) {
      seen.add(label)
      lines.push(label)
    }
  }
  return lines
}
