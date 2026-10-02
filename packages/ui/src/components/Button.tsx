import type { ButtonHTMLAttributes } from 'react'
import type { IconName } from '../icons/grids.js'
import { cx } from '../lib/cx.js'
import { PixelIcon } from './PixelIcon.js'
import { VisuallyHidden } from './VisuallyHidden.js'

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  pending?: boolean
  icon?: IconName
  iconOnly?: boolean
}

export const Button = ({
  variant = 'default',
  pending = false,
  icon,
  iconOnly = false,
  type = 'button',
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    type={type}
    className={cx('btn', `btn--${variant}`, iconOnly && 'btn--icon', className)}
    disabled={disabled === true || pending}
    aria-busy={pending || undefined}
  >
    {icon === undefined ? null : <PixelIcon name={icon} />}
    {iconOnly ? <VisuallyHidden>{children}</VisuallyHidden> : <span>{children}</span>}
    {pending ? <span className="cursor-blink" aria-hidden="true" /> : null}
  </button>
)
