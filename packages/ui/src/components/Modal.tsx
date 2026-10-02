import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react'
import { Button } from './Button.js'

export interface ModalProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  closeLabel?: string
  initialFocusRef?: RefObject<HTMLElement | null>
}

export const Modal = ({
  title,
  onClose,
  children,
  closeLabel = 'Close',
  initialFocusRef,
}: ModalProps) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const target = initialFocusRef?.current ?? dialogRef.current
    target?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose, initialFocusRef])

  return (
    <div className="modal-root">
      <button
        type="button"
        className="modal-overlay"
        aria-label={`${closeLabel} dialog`}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="panel__header">
          <h2 className="panel__title" id={titleId}>
            {title}
          </h2>
          <Button variant="ghost" iconOnly icon="cross" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
        <div className="panel__body">{children}</div>
      </div>
    </div>
  )
}
