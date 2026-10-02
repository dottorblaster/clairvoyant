/**
 * Pixel.icon sprite data.
 *
 * Every icon is an 8x8 grid written as eight strings of eight characters, so the
 * shape can be read (and edited) directly in source:
 *
 *   '#' painted pixel
 *   '.' transparent pixel
 *
 * House rules, enforced by `icons.test.ts`:
 *   - exactly 8 rows of exactly 8 characters
 *   - only '#' and '.'
 *   - at least one painted pixel
 *
 * The grids are drawn on a 1-unit grid inside an `8 8` viewBox, so every painted
 * pixel is a crisp square at any multiple of 8 device pixels (16, 24, 32...).
 */
export const ICON_NAMES = [
  'calendar',
  'check',
  'clock',
  'plus',
  'share',
  'user',
  'cross',
  'arrow-left',
  'alert',
  'power',
  'sun',
  'moon',
] as const

export type IconName = (typeof ICON_NAMES)[number]

export const ICON_GRIDS: Record<IconName, readonly string[]> = {
  calendar: [
    '..#..#..',
    '########',
    '#......#',
    '#.####.#',
    '#......#',
    '#.#..#.#',
    '#......#',
    '########',
  ],
  check: [
    '........',
    '......##',
    '.....##.',
    '##..##..',
    '.##.##..',
    '..###...',
    '...#....',
    '........',
  ],
  clock: [
    '..####..',
    '.#....#.',
    '#...#..#',
    '#...#..#',
    '#...####',
    '#......#',
    '.#....#.',
    '..####..',
  ],
  plus: [
    '........',
    '...##...',
    '...##...',
    '.######.',
    '.######.',
    '...##...',
    '...##...',
    '........',
  ],
  share: [
    '........',
    '......##',
    '.....###',
    '.####...',
    '.##.....',
    '...##...',
    '.....###',
    '......##',
  ],
  user: [
    '..####..',
    '.#....#.',
    '.#....#.',
    '..####..',
    '...##...',
    '.######.',
    '########',
    '########',
  ],
  cross: [
    '........',
    '.##..##.',
    '..####..',
    '...##...',
    '...##...',
    '..####..',
    '.##..##.',
    '........',
  ],
  'arrow-left': [
    '...#....',
    '..##....',
    '.###....',
    '########',
    '########',
    '.###....',
    '..##....',
    '...#....',
  ],
  alert: [
    '..####..',
    '.#....#.',
    '#..##..#',
    '#..##..#',
    '#..##..#',
    '#......#',
    '.#.##.#.',
    '..####..',
  ],
  power: [
    '...##...',
    '.#.##.#.',
    '#..##..#',
    '#..##..#',
    '#......#',
    '#......#',
    '.#....#.',
    '..####..',
  ],
  sun: [
    '#..##..#',
    '.#.##.#.',
    '..####..',
    '.######.',
    '.######.',
    '..####..',
    '.#.##.#.',
    '#..##..#',
  ],
  moon: [
    '..####..',
    '.###....',
    '###.....',
    '###.....',
    '###.....',
    '###.....',
    '.###....',
    '..####..',
  ],
}
