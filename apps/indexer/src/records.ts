const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

export interface ParsedEvent {
  name: string
  startsAt: Date | null
  endsAt: Date | null
}

export const parseEventRecord = (record: unknown): ParsedEvent | null => {
  if (typeof record !== 'object' || record === null) return null
  const value = record as Record<string, unknown>

  const name = typeof value.name === 'string' && value.name.length > 0 ? value.name : null
  if (name === null) return null

  const startsAt = value.startsAt == null ? null : toDate(value.startsAt)
  if (value.startsAt != null && startsAt === null) return null

  const endsAt = value.endsAt == null ? null : toDate(value.endsAt)
  if (value.endsAt != null && endsAt === null) return null

  return { name, startsAt, endsAt }
}

export interface ParsedRsvp {
  subjectUri: string
  status: string
}

export const parseRsvpRecord = (record: unknown): ParsedRsvp | null => {
  if (typeof record !== 'object' || record === null) return null
  const value = record as Record<string, unknown>

  const subject = value.subject
  if (typeof subject !== 'object' || subject === null) return null
  const subjectUri = (subject as Record<string, unknown>).uri
  if (typeof subjectUri !== 'string' || subjectUri.length === 0) return null

  const status = typeof value.status === 'string' ? value.status : null
  if (status === null) return null

  return { subjectUri, status }
}
