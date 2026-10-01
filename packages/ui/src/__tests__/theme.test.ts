import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  initTheme,
  nextThemeMode,
  parseThemeMode,
  readStoredThemeMode,
  resolveTheme,
  THEME_MODE_LABEL,
  THEME_MODES,
  THEME_STORAGE_KEY,
  type ThemeMode,
  writeStoredThemeMode,
} from '../../dist/index.js'

/**
 * Swaps `globalThis.localStorage` for the duration of `run`, then restores
 * whatever was there (including nothing). `localStorage` throws on access in
 * some privacy modes, so a `get`-only descriptor is a legitimate case to test.
 */
const withLocalStorage = (descriptor: PropertyDescriptor, run: () => void): void => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor })
  try {
    run()
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'localStorage')
    else Object.defineProperty(globalThis, 'localStorage', original)
  }
}

/** A stand-in for `document.documentElement` that records the theme it is given. */
const fakeRoot = (): HTMLElement & { dataset: Record<string, string> } =>
  ({ dataset: {} }) as unknown as HTMLElement & { dataset: Record<string, string> }

describe('parseThemeMode', () => {
  test('accepts the three known modes', () => {
    assert.equal(parseThemeMode('auto'), 'auto')
    assert.equal(parseThemeMode('light'), 'light')
    assert.equal(parseThemeMode('dark'), 'dark')
  })

  test('falls back to auto for anything else', () => {
    const rejected: unknown[] = [null, undefined, '', 'Light', 'DARK', 'system', '0', 0, {}, []]
    for (const value of rejected) {
      assert.equal(parseThemeMode(value), 'auto', `expected auto for ${JSON.stringify(value)}`)
    }
  })
})

describe('resolveTheme', () => {
  test('auto follows the operating system', () => {
    assert.equal(resolveTheme('auto', true), 'light')
    assert.equal(resolveTheme('auto', false), 'dark')
  })

  test('an explicit mode overrides the operating system', () => {
    assert.equal(resolveTheme('light', false), 'light')
    assert.equal(resolveTheme('dark', true), 'dark')
  })
})

describe('nextThemeMode', () => {
  test('walks auto -> light -> dark -> auto', () => {
    assert.equal(nextThemeMode('auto'), 'light')
    assert.equal(nextThemeMode('light'), 'dark')
    assert.equal(nextThemeMode('dark'), 'auto')
  })

  test('visits every mode exactly once per cycle and returns to the start', () => {
    const visited: ThemeMode[] = []
    let mode: ThemeMode = 'auto'
    for (let step = 0; step < THEME_MODES.length; step += 1) {
      visited.push(mode)
      mode = nextThemeMode(mode)
    }
    assert.deepEqual([...visited].sort(), [...THEME_MODES].sort())
    assert.equal(mode, 'auto')
  })

  test('every mode has a human-readable label', () => {
    for (const mode of THEME_MODES) {
      assert.ok(THEME_MODE_LABEL[mode].length > 0, `${mode} has no label`)
    }
  })
})

describe('readStoredThemeMode', () => {
  test('reads a stored mode from the documented key', () => {
    const store = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? 'light' : null) }
    withLocalStorage({ value: store }, () => {
      assert.equal(readStoredThemeMode(), 'light')
    })
  })

  test('ignores a corrupt stored value', () => {
    withLocalStorage({ value: { getItem: () => 'chartreuse' } }, () => {
      assert.equal(readStoredThemeMode(), 'auto')
    })
  })

  test('survives storage that throws on access', () => {
    withLocalStorage(
      {
        get() {
          throw new Error('storage is blocked')
        },
      },
      () => {
        assert.equal(readStoredThemeMode(), 'auto')
      },
    )
  })

  test('survives storage being absent entirely', () => {
    withLocalStorage({ value: undefined }, () => {
      assert.equal(readStoredThemeMode(), 'auto')
    })
  })
})

describe('writeStoredThemeMode', () => {
  test('persists under the documented key', () => {
    const writes: Array<[string, string]> = []
    const store = { setItem: (key: string, value: string) => writes.push([key, value]) }
    withLocalStorage({ value: store }, () => {
      writeStoredThemeMode('dark')
    })
    assert.deepEqual(writes, [[THEME_STORAGE_KEY, 'dark']])
  })

  test('never throws when the write is rejected', () => {
    withLocalStorage(
      {
        value: {
          setItem() {
            throw new Error('quota exceeded')
          },
        },
      },
      () => {
        assert.doesNotThrow(() => writeStoredThemeMode('light'))
      },
    )
  })
})

describe('initTheme', () => {
  test('paints the resolved theme onto the root element', () => {
    withLocalStorage({ value: { getItem: () => null } }, () => {
      const root = fakeRoot()
      const resolved = initTheme(root)
      assert.equal(root.dataset.theme, resolved)
      assert.ok(resolved === 'dark' || resolved === 'light')
    })
  })

  test('an explicitly stored mode wins over the OS preference', () => {
    withLocalStorage({ value: { getItem: () => 'light' } }, () => {
      const root = fakeRoot()
      initTheme(root)
      assert.equal(root.dataset.theme, 'light')
    })
  })

  test('with no stored mode it resolves auto deterministically', () => {
    withLocalStorage({ value: { getItem: () => null } }, () => {
      const root = fakeRoot()
      initTheme(root)
      // Node has no `matchMedia`, so auto can only mean dark here.
      assert.equal(root.dataset.theme, 'dark')
    })
  })
})
