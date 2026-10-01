// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { THEME_STORAGE_KEY, ThemeToggle } from '../../../dist/index.js'

interface MediaQueryHarness {
  setMatches: (matches: boolean) => void
  listenerCount: () => number
}

/** jsdom has no `matchMedia`; this is a controllable stand-in. */
const installMatchMedia = (initialMatches: boolean): MediaQueryHarness => {
  const listeners = new Set<() => void>()
  const query = {
    matches: initialMatches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  )

  return {
    setMatches: (matches) => {
      query.matches = matches
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  localStorage.clear()
})

describe('ThemeToggle cycling', () => {
  test('walks auto -> light -> dark and back', () => {
    installMatchMedia(false)
    render(<ThemeToggle />)

    expect(screen.getByRole('button').textContent).toContain('Theme: Auto')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toContain('Theme: Light')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toContain('Theme: Dark')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toContain('Theme: Auto')
  })

  test('persists the chosen mode and paints the resolved theme', () => {
    installMatchMedia(false)
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button'))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('ThemeToggle auto mode', () => {
  test('resolves auto from the OS preference', () => {
    installMatchMedia(true)
    render(<ThemeToggle />)

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  test('follows an OS change while in auto', () => {
    const media = installMatchMedia(false)
    render(<ThemeToggle />)
    expect(document.documentElement.dataset.theme).toBe('dark')

    media.setMatches(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  test('stops following the OS once a mode is pinned, and cleans up the listener', () => {
    const media = installMatchMedia(false)
    const { unmount } = render(<ThemeToggle />)
    expect(media.listenerCount()).toBe(1)

    fireEvent.click(screen.getByRole('button')) // -> light (pinned)
    expect(media.listenerCount()).toBe(0)
    expect(document.documentElement.dataset.theme).toBe('light')

    media.setMatches(false)
    expect(document.documentElement.dataset.theme).toBe('light')

    unmount()
  })
})
