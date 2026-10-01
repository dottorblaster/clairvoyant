import type { HTMLAttributes } from 'react'
import { cx } from '../lib/cx.js'

export type VisuallyHiddenProps = HTMLAttributes<HTMLSpanElement>

/**
 * Hides content visually while leaving it in the accessibility tree — for
 * labels on icon-only controls. Uses `clip-path` rather than `display: none`
 * or `visibility: hidden`, both of which remove the node from that tree.
 */
export const VisuallyHidden = ({ className, children, ...rest }: VisuallyHiddenProps) => (
  <span {...rest} className={cx('visually-hidden', className)}>
    {children}
  </span>
)
