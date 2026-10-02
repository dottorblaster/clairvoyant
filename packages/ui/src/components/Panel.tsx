import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx.js'

const PanelTitle = ({ level, children }: { level: 1 | 2 | 3; children: ReactNode }) => {
  if (level === 1) return <h1 className="panel__title">{children}</h1>
  if (level === 2) return <h2 className="panel__title">{children}</h2>
  return <h3 className="panel__title">{children}</h3>
}

export type PanelVariant = 'default' | 'flush'

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  headingLevel?: 1 | 2 | 3
  meta?: ReactNode
  actions?: ReactNode
  variant?: PanelVariant
}

export const Panel = ({
  title,
  headingLevel = 1,
  meta,
  actions,
  variant = 'default',
  className,
  children,
  ...rest
}: PanelProps) => {
  const hasHeader = title !== undefined || actions !== undefined

  return (
    <section {...rest} className={cx('panel', className)}>
      {hasHeader ? (
        <div className="panel__header">
          {title === undefined ? null : <PanelTitle level={headingLevel}>{title}</PanelTitle>}
          {actions === undefined ? null : <div className="panel__header-actions">{actions}</div>}
        </div>
      ) : null}
      <div className={cx('panel__body', variant === 'flush' && 'panel__body--flush')}>
        {meta === undefined ? null : <p className="muted small">{meta}</p>}
        {children}
      </div>
    </section>
  )
}
