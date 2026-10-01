import type { ButtonHTMLAttributes } from 'react'
import type { IconName } from '../icons/grids.js'
import { cx } from '../lib/cx.js'
import { PixelIcon } from './PixelIcon.js'
import { VisuallyHidden } from './VisuallyHidden.js'

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Marks the action in flight: disables the button, sets `aria-busy`, and appends the block cursor. */
  pending?: boolean
  icon?: IconName
  /** Square, label-less button. The label is kept for assistive technology. */
  iconOnly?: boolean
}

/**
 * Defaults to `type="button"`. That is deliberate: a bare `<button>` inside a
 * form submits it, which is almost never what a design-system button meant.
 */
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
