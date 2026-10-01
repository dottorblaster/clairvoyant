import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

const originalFetch = globalThis.fetch

// Unmount anything a test rendered so state cannot leak between tests, and undo
// global stubs (fetch, location, clipboard) installed by a test.
afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  vi.unstubAllGlobals()
})
