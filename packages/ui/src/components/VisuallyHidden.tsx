import type { HTMLAttributes } from 'react'
import { cx } from '../lib/cx.js'

export type VisuallyHiddenProps = HTMLAttributes<HTMLSpanElement>

export const VisuallyHidden = ({ className, children, ...rest }: VisuallyHiddenProps) => (
  <span {...rest} className={cx('visually-hidden', className)}>
    {children}
  </span>
)
