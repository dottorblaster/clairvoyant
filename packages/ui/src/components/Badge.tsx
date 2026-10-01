import type { HTMLAttributes } from 'react'
import type { IconName } from '../icons/grids.js'
import { cx } from '../lib/cx.js'
import { PixelIcon } from './PixelIcon.js'

export type BadgeTone = 'default' | 'ink' | 'muted'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  icon?: IconName
}

/** A small status chip. `ink` is the loudest, `muted` the quietest. */
export const Badge = ({ tone = 'default', icon, className, children, ...rest }: BadgeProps) => (
  <span {...rest} className={cx('badge', `badge--${tone}`, className)}>
    {icon === undefined ? null : <PixelIcon name={icon} size={8} />}
    {children}
  </span>
)
