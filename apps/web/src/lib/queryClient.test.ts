import { describe, expect, test } from 'vitest'
import { ApiError } from './api'
import { queryClient } from './queryClient'

const retry = queryClient.getDefaultOptions().queries?.retry
const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (typeof retry !== 'function') throw new Error('retry is not a function')
  return retry(failureCount, error)
}

describe('queryClient defaults', () => {
  test('keeps data fresh for thirty seconds', () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000)
  })
})

describe('retry policy', () => {
  test('never retries auth or missing-resource failures', () => {
    for (const status of [401, 403, 404]) {
      expect(shouldRetry(0, new ApiError(status, 'x'))).toBe(false)
    }
  })

  test('retries other failures twice', () => {
    const error = new ApiError(500, 'x')
    expect(shouldRetry(0, error)).toBe(true)
    expect(shouldRetry(1, error)).toBe(true)
    expect(shouldRetry(2, error)).toBe(false)
  })

  test('retries an error without a status twice', () => {
    const error = new Error('network')
    expect(shouldRetry(0, error)).toBe(true)
    expect(shouldRetry(2, error)).toBe(false)
  })
})
