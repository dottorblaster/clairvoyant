export const BASE_BACKOFF_MS = 1_000
export const MAX_BACKOFF_MS = 60_000

export interface HttpErrorInfo {
  status?: number
  retryAfterMs?: number
}

interface CandidateError {
  status?: unknown
  headers?: unknown
  response?: {
    status?: unknown
    headers?: { get?: (name: string) => string | null }
  }
}

const getHeader = (name: string, candidate: CandidateError): string | null => {
  const headers = candidate.response?.headers

  if (headers && typeof headers.get === 'function') {
    return headers.get(name)
  }

  return null
}

export const getRetryAfter = (retryAfter: string | null): number | undefined => {
  if (retryAfter) {
    const seconds = Number(retryAfter)

    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1_000)
    }

    const date = Date.parse(retryAfter)

    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now())
    }
  }

  return undefined
}

export const classifyError = (error: unknown): HttpErrorInfo => {
  if (typeof error !== 'object' || error === null) {
    return {}
  }

  const candidate = error as CandidateError

  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.response?.status === 'number'
        ? candidate.response.status
        : undefined

  const retryAfterMs = getRetryAfter(getHeader('retry-after', candidate))

  return retryAfterMs === undefined ? { status } : { status, retryAfterMs }
}

export const nextBackoffMs = (current: number): number => Math.min(current * 2, MAX_BACKOFF_MS)

export type FailureDecision =
  | { action: 'fatal'; status: number }
  | { action: 'wait'; waitMs: number; nextBackoffMs: number; rateLimited: boolean }

// 401 is fatal (bad API key), 429 honours Retry-After, anything else backs off.
export const decideOnFailure = (error: unknown, backoff: number): FailureDecision => {
  const info = classifyError(error)

  if (info.status === 401) {
    return { action: 'fatal', status: 401 }
  }

  if (info.status === 429) {
    return {
      action: 'wait',
      waitMs: info.retryAfterMs ?? backoff,
      nextBackoffMs: nextBackoffMs(backoff),
      rateLimited: true,
    }
  }

  return {
    action: 'wait',
    waitMs: backoff,
    nextBackoffMs: nextBackoffMs(backoff),
    rateLimited: false,
  }
}
