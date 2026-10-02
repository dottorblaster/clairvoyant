import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx.js'

export interface LoadingProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode
}

export const Loading = ({ className, children = 'Loading', ...rest }: LoadingProps) => (
  <p {...rest} className={cx('loading', className)} role="status">
    {children}
    <span className="cursor-blink" aria-hidden="true" />
  </p>
)
