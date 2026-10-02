// Permissive reader, not a validator. The indexer already validated the record,
// so a partial or malformed value degrades to "nothing to show" instead of throwing.
const EVENT_URI_TYPE = 'community.lexicon.calendar.event#uri'
const ADDRESS_TYPE = 'community.lexicon.location.address'
const FSQ_TYPE = 'community.lexicon.location.fsq'
const GEO_TYPE = 'community.lexicon.location.geo'
const HTHREE_TYPE = 'community.lexicon.location.hthree'

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface EventDetails {
  description: string | null
  locations: unknown[]
}

const EMPTY_DETAILS: EventDetails = { description: null, locations: [] }

export const parseEventDetails = (raw: unknown): EventDetails => {
  const record = asRecord(raw)
  if (record === null) return EMPTY_DETAILS

  const locations = Array.isArray(record.locations)
    ? record.locations.filter((value) => asRecord(value) !== null)
    : []

  return { description: text(record.description), locations }
}

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
