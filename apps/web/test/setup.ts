import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  vi.unstubAllGlobals()
})
