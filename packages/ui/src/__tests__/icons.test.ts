import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ICON_GRIDS, ICON_NAMES, PixelIcon, paintedPixels } from '../../dist/index.js'

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(element)

describe('icon grids', () => {
  test('ICON_GRIDS covers exactly ICON_NAMES', () => {
    assert.deepEqual(Object.keys(ICON_GRIDS).sort(), [...ICON_NAMES].sort())
  })

  test('every icon is an 8x8 grid drawn only with # and .', () => {
    for (const name of ICON_NAMES) {
      const grid = ICON_GRIDS[name]
      assert.equal(grid.length, 8, `${name}: expected 8 rows, got ${grid.length}`)
      grid.forEach((row, y) => {
        assert.equal(row.length, 8, `${name} row ${y}: expected 8 columns, got "${row}"`)
        assert.match(row, /^[#.]+$/, `${name} row ${y}: only "#" and "." are allowed`)
      })
    }
  })

  test('every icon paints at least one pixel', () => {
    for (const name of ICON_NAMES) {
      assert.ok(paintedPixels(ICON_GRIDS[name]).length > 0, `${name} is blank`)
    }
  })
})

describe('paintedPixels', () => {
  test('returns the offsets of painted pixels only', () => {
    assert.deepEqual(paintedPixels(['#.#.', '.#.#']), [
      [0, 0],
      [2, 0],
      [1, 1],
      [3, 1],
    ])
  })

  test('returns nothing for an empty grid', () => {
    assert.deepEqual(paintedPixels(['....', '....']), [])
  })
})

describe('PixelIcon', () => {
  test('draws one rect per painted pixel on an 8x8 viewBox', () => {
    const markup = render(createElement(PixelIcon, { name: 'cross' }))
    assert.match(markup, /viewBox="0 0 8 8"/)
    const rects = markup.match(/<rect /g) ?? []
    assert.equal(rects.length, paintedPixels(ICON_GRIDS.cross).length)
  })

  test('inherits the current text colour', () => {
    const markup = render(createElement(PixelIcon, { name: 'check' }))
    assert.match(markup, /fill="currentColor"/)
  })

  test('is hidden from assistive technology by default', () => {
    const markup = render(createElement(PixelIcon, { name: 'check' }))
    assert.match(markup, /aria-hidden="true"/)
    assert.doesNotMatch(markup, /role="img"/)
    assert.doesNotMatch(markup, /<title>/)
  })

  test('exposes an accessible name when a title is given', () => {
    const markup = render(createElement(PixelIcon, { name: 'check', title: 'Confirmed' }))
    assert.match(markup, /role="img"/)
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1]
    assert.ok(labelledBy, 'a titled icon must be labelled')
    assert.match(markup, new RegExp(`<title id="${labelledBy}">Confirmed</title>`))
    assert.doesNotMatch(markup, /aria-hidden="true"/)
  })

  test('scales by width and height, not by resampling the grid', () => {
    const markup = render(createElement(PixelIcon, { name: 'plus', size: 32 }))
    assert.match(markup, /width="32"/)
    assert.match(markup, /height="32"/)
    assert.match(markup, /viewBox="0 0 8 8"/)
  })
})
