import { type SVGProps, useId } from 'react'
import { ICON_GRIDS, type IconName } from '../icons/grids.js'
import { cx } from '../lib/cx.js'

export interface PixelIconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  /** Rendered size in px. Multiples of 8 (16, 24, 32) stay perfectly crisp. */
  size?: number
  /**
   * Accessible name. Omit it for decorative icons — the icon is then hidden from
   * assistive technology and the surrounding text carries the meaning.
   */
  title?: string
}

/**
 * Flattens a grid into `[x, y]` offsets of its painted pixels. Exported because
 * it is also the cheapest way to assert an icon's shape in tests.
 */
export const paintedPixels = (grid: readonly string[]): Array<[number, number]> => {
  const pixels: Array<[number, number]> = []
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '#') pixels.push([x, y])
    }
  })
  return pixels
}

/**
 * Renders one sprite from `ICON_GRIDS` as hard-edged SVG squares on an 8x8 grid.
 * Inherits `currentColor`, so it follows whatever text colour it is placed in.
 *
 * A decorative icon and a labelled icon are two different things, so they are
 * two explicit branches rather than one element with conditional ARIA
 * attributes. That keeps both cases statically checkable and unambiguous.
 */
export const PixelIcon = ({ name, size = 16, title, className, ...rest }: PixelIconProps) => {
  const titleId = useId()

  const shared: SVGProps<SVGSVGElement> = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 8 8',
    width: size,
    height: size,
    fill: 'currentColor',
    focusable: 'false',
    className: cx('pixel-icon', className),
    ...rest,
  }

  const pixels = paintedPixels(ICON_GRIDS[name]).map(([x, y]) => (
    <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
  ))

  if (title === undefined) {
    return (
      <svg {...shared} aria-hidden="true">
        {pixels}
      </svg>
    )
  }

  return (
    <svg {...shared} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{title}</title>
      {pixels}
    </svg>
  )
}
