import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

/**
 * Tests the stylesheet as data. These are the invariants that are easy to break
 * by hand and impossible to see in a code review: a token that is read but never
 * defined, a theme that forgot one variable, a corner that quietly got rounded.
 */

const FILES = ['tokens.css', 'base.css', 'components.css', 'utilities.css']

const read = (file: string): string =>
  readFileSync(new URL(`../styles/${file}`, import.meta.url), 'utf8')

const allCss = FILES.map((file) => read(file)).join('\n')
const tokensCss = read('tokens.css')

const isDefined = (value: string | undefined): value is string => value !== undefined

/** Slices tokens.css into the block following a `@tokens <name>` marker. */
const block = (name: string): string => {
  // The trailing space matters: it stops "light" from matching "light-fallback".
  const marker = `@tokens ${name} `
  const start = tokensCss.indexOf(marker)
  assert.ok(start >= 0, `tokens.css is missing the "${marker.trim()}" marker`)
  const rest = tokensCss.slice(start)
  const next = rest.indexOf('@tokens', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

/** Parses `--name: value;` declarations out of a chunk of CSS. */
const declarations = (source: string): Map<string, string> => {
  const found = new Map<string, string>()
  for (const match of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1]
    const value = match[2]
    if (name === undefined || value === undefined) continue
    found.set(name, value.trim().replace(/\s+/g, ' '))
  }
  return found
}

const shared = declarations(tokensCss.slice(0, tokensCss.indexOf('@tokens dark')))
const dark = declarations(block('dark'))
const lightFallback = declarations(block('light-fallback'))
const light = declarations(block('light'))

describe('token definitions', () => {
  test('every custom property that is read is also defined', () => {
    const defined = new Set(
      [...allCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]).filter(isDefined),
    )
    const used = new Set(
      [...allCss.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]).filter(isDefined),
    )
    const missing = [...used].filter((name) => !defined.has(name)).sort()
    assert.deepEqual(missing, [], `tokens are read but never defined: ${missing.join(', ')}`)
  })

  test('the shared block actually defines the geometry tokens', () => {
    assert.equal(shared.get('--radius'), '0px')
    assert.equal(shared.get('--border-w'), '2px')
    assert.equal(shared.get('--notch'), '4px')
    assert.ok(shared.has('--clip-notch'), 'the notched-corner silhouette must be defined')
  })
})

describe('themes', () => {
  test('dark and light define exactly the same tokens', () => {
    const darkNames = [...dark.keys()].sort()
    const lightNames = [...light.keys()].sort()
    const onlyDark = darkNames.filter((name) => !lightNames.includes(name))
    const onlyLight = lightNames.filter((name) => !darkNames.includes(name))
    assert.deepEqual(
      { onlyDark, onlyLight },
      { onlyDark: [], onlyLight: [] },
      'a token defined in one theme must be defined in both',
    )
  })

  test('the pre-JS fallback matches the explicit light theme exactly', () => {
    assert.deepEqual([...lightFallback.keys()].sort(), [...light.keys()].sort())
    for (const [name, value] of light) {
      assert.equal(lightFallback.get(name), value, `${name} differs between the light blocks`)
    }
  })

  test('every theme block sets color-scheme so native controls follow', () => {
    const themes: Array<[string, string]> = [
      ['dark', block('dark')],
      ['light', block('light')],
      ['light-fallback', block('light-fallback')],
    ]
    for (const [name, source] of themes) {
      assert.match(source, /color-scheme:\s*(dark|light)\s*;/, `${name} is missing color-scheme`)
    }
  })

  test('each theme defines a full set of colour tokens', () => {
    const required = [
      '--bg',
      '--surface',
      '--surface-inset',
      '--fg',
      '--fg-muted',
      '--border',
      '--border-strong',
      '--focus',
      '--action-bg',
      '--action-fg',
      '--danger-bg',
      '--danger-fg',
      '--panel-head-bg',
      '--panel-head-fg',
      '--overlay',
      '--scanline',
      '--vignette',
      '--shadow-color',
    ]
    for (const [name, tokens] of [
      ['dark', dark],
      ['light', light],
    ] as const) {
      for (const token of required) {
        assert.ok(tokens.has(token), `${name} is missing ${token}`)
      }
    }
  })
})

describe('palette discipline', () => {
  test('the DMG ramp is exactly the canonical four shades', () => {
    assert.equal(shared.get('--dmg-0'), '#0f380f')
    assert.equal(shared.get('--dmg-1'), '#306230')
    assert.equal(shared.get('--dmg-2'), '#8bac0f')
    assert.equal(shared.get('--dmg-3'), '#9bbc0f')
  })

  test('the light theme is the DMG screen and the dark theme inverts it', () => {
    assert.equal(light.get('--bg'), 'var(--dmg-3)')
    assert.equal(light.get('--fg'), 'var(--dmg-0)')
    assert.equal(dark.get('--fg'), 'var(--dmg-3)')
  })

  test('danger is the only accent, and it is the NES red', () => {
    assert.equal(dark.get('--danger-bg'), 'var(--nes-red)')
    assert.equal(light.get('--danger-bg'), 'var(--nes-red)')
    assert.equal(shared.get('--nes-red'), '#f83800')
  })

  test('there is no red *text* token, because red text is not legible enough', () => {
    // Danger is always a filled block with near-black ink. If a danger-text
    // token reappears it must come with a contrast measurement.
    assert.equal(shared.get('--nes-red-ink'), undefined)
    assert.equal(dark.get('--danger-text'), undefined)
    assert.equal(light.get('--danger-text'), undefined)
  })
})

describe('pixel geometry', () => {
  test('nothing in the system is rounded', () => {
    const radii = [...allCss.matchAll(/border-radius\s*:\s*([^;]+);/g)].map((match) =>
      (match[1] ?? '').trim(),
    )
    assert.ok(radii.length > 0, 'expected the components to declare border-radius')
    for (const radius of radii) {
      assert.equal(radius, 'var(--radius)', `border-radius must stay 0, found "${radius}"`)
    }
  })

  test('shadows are only the two sanctioned shapes', () => {
    const shadows = [...allCss.matchAll(/box-shadow\s*:\s*([^;]+);/g)].map((match) =>
      (match[1] ?? '').trim(),
    )
    assert.ok(shadows.length > 0, 'expected the components to declare box-shadow')
    for (const shadow of shadows) {
      const sanctioned =
        shadow.includes('var(--shadow-hard)') ||
        shadow.startsWith('inset ') ||
        // Removing a shadow is always allowed.
        shadow === 'none' ||
        // The pressed state: the hard shadow collapses to nothing.
        shadow === '0 0 0 0 var(--shadow-color)'
      assert.ok(sanctioned, `unsanctioned shadow: "${shadow}"`)
    }
    // A hard offset with a zero blur radius: the whole point of the NES look.
    assert.ok(allCss.includes('--shadow-hard: 4px 4px 0 0'))
  })
})

describe('the CRT overlay stays an atmosphere', () => {
  test('scanlines are faint in both themes', () => {
    for (const [name, tokens] of [
      ['dark', dark],
      ['light', light],
    ] as const) {
      const scanline = tokens.get('--scanline')
      assert.ok(scanline !== undefined, `${name} must define --scanline`)
      const alpha = Number(scanline.match(/\/\s*([\d.]+)\s*\)/)?.[1] ?? '0')
      assert.ok(alpha > 0 && alpha <= 0.25, `${name} --scanline alpha ${alpha} is not subtle`)
    }
  })

  test('the overlay cannot intercept pointer events', () => {
    assert.match(read('base.css'), /body::after\s*\{[^}]*pointer-events:\s*none/)
  })

  test('the overlay sits below the modal layer', () => {
    const scanlines = Number(shared.get('--z-scanlines'))
    const modal = Number(shared.get('--z-modal'))
    assert.ok(scanlines < modal, 'scanlines must not paint over a dialog')
  })
})

/* ==========================================================================
   Contrast, computed from the token values themselves.

   These are the claims in the tokens.css header comment, verified rather than
   asserted. Everything the resolver needs is in the palette, so the whole thing
   is arithmetic on the stylesheet — no browser, no dependencies.
   ========================================================================== */

type Rgb = [number, number, number]

/** Resolves a token to sRGB channels, following `var()` and `color-mix()`. */
const resolveColor = (tokens: Map<string, string>, name: string, depth = 0): Rgb => {
  assert.ok(depth < 10, `token ${name} is circular`)
  const value = tokens.get(name) ?? shared.get(name)
  assert.ok(value !== undefined, `${name} is not defined`)

  const reference = value.match(/^var\((--[\w-]+)\)$/)
  if (reference?.[1] !== undefined) return resolveColor(tokens, reference[1], depth + 1)

  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex?.[1] !== undefined) {
    const digits = hex[1]
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ]
  }

  const mix = value.match(
    /^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s*([\d.]+)%,\s*var\((--[\d\w-]+)\)\s*\)$/,
  )
  if (mix?.[1] !== undefined && mix[2] !== undefined && mix[3] !== undefined) {
    const first = resolveColor(tokens, mix[1], depth + 1)
    const second = resolveColor(tokens, mix[3], depth + 1)
    // `in srgb` interpolates the gamma-encoded channels, per the colour spec.
    const weight = Number(mix[2]) / 100
    return first.map(
      (channel, index) => channel * weight + (second[index] ?? 0) * (1 - weight),
    ) as Rgb
  }

  throw new Error(`cannot resolve a colour for ${name}: ${value}`)
}

const relativeLuminance = ([r, g, b]: Rgb): number => {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrast = (foreground: Rgb, background: Rgb): number => {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const TEXT_PAIRS: Array<[string, string, string]> = [
  ['body ink on the page', '--fg', '--bg'],
  ['body ink on a surface', '--fg', '--surface'],
  ['muted ink on a surface', '--fg-muted', '--surface'],
  ['ink in an input well', '--fg', '--surface-inset'],
  ['ink on a panel title bar', '--panel-head-fg', '--panel-head-bg'],
  ['ink on a filled action', '--action-fg', '--action-bg'],
  ['ink on a filled danger block', '--danger-fg', '--danger-bg'],
]

const OUTLINE_PAIRS: Array<[string, string, string]> = [
  ['strong border on the page', '--border-strong', '--bg'],
  ['focus ring on the page', '--focus', '--bg'],
]

describe('contrast', () => {
  test('the resolver handles hex, var() and color-mix()', () => {
    assert.deepEqual(resolveColor(dark, '--dmg-0'), [15, 56, 15])
    assert.deepEqual(resolveColor(dark, '--bg'), [8, 20, 8])
    // 88% of shade 0 over shade 3.
    const mixed = resolveColor(light, '--fg-muted')
    assert.ok(Math.abs(mixed[0] - 31.8) < 0.01)
    assert.ok(Math.abs(mixed[1] - 71.84) < 0.01)
  })

  for (const [theme, tokens] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    test(`${theme}: all text meets WCAG AA (4.5:1)`, () => {
      for (const [label, fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(resolveColor(tokens, fg), resolveColor(tokens, bg))
        assert.ok(ratio >= 4.5, `${theme} ${label} is ${ratio.toFixed(2)}:1, needs 4.5:1`)
      }
    })

    test(`${theme}: all outlines meet the 3:1 non-text minimum`, () => {
      for (const [label, fg, bg] of OUTLINE_PAIRS) {
        const ratio = contrast(resolveColor(tokens, fg), resolveColor(tokens, bg))
        assert.ok(ratio >= 3, `${theme} ${label} is ${ratio.toFixed(2)}:1, needs 3:1`)
      }
    })
  }

  test('the filled danger block is legible in both themes, which is why danger has no text colour', () => {
    for (const tokens of [dark, light]) {
      const ratio = contrast(
        resolveColor(tokens, '--danger-fg'),
        resolveColor(tokens, '--danger-bg'),
      )
      assert.ok(ratio >= 4.5, `danger block is ${ratio.toFixed(2)}:1`)
    }
  })
})
