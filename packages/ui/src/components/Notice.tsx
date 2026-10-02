import type { HTMLAttributes, ReactNode } from 'react'
import type { IconName } from '../icons/grids.js'
import { cx } from '../lib/cx.js'
import { PixelIcon } from './PixelIcon.js'

export type NoticeTone = 'info' | 'error' | 'success'

const DEFAULT_ICON: Record<NoticeTone, IconName | null> = {
  info: null,
  error: 'alert',
  success: 'check',
}

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone
  title?: ReactNode
  icon?: IconName | null
}

export const Notice = ({
  tone = 'info',
  title,
  icon,
  className,
  children,
  ...rest
}: NoticeProps) => {
  const resolvedIcon = icon === undefined ? DEFAULT_ICON[tone] : icon

  return (
    <div
      {...rest}
      className={cx('notice', `notice--${tone}`, className)}
      {...(tone === 'error' ? { role: 'alert' } : {})}
    >
      {resolvedIcon === null ? null : <PixelIcon className="notice__icon" name={resolvedIcon} />}
      <div className="notice__body">
        {title === undefined ? null : <p className="notice__title">{title}</p>}
        {children}
      </div>
    </div>
  )
}
