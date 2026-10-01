import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react'
import { Button } from './Button.js'

export interface ModalProps {
  title: ReactNode
  /** Called for Escape, the backdrop, and the close control. */
  onClose: () => void
  children: ReactNode
  closeLabel?: string
  /** Element to focus on open. Defaults to the dialog itself. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * A modal dialog drawn as an NES dialog box.
 *
 * The backdrop is a real `<button>`, so "click outside to dismiss" is also
 * reachable by keyboard. Opening locks body scroll, moves focus into the dialog,
 * and closing restores focus to whatever had it before.
 *
 * Known limitation: this does not trap Tab inside the dialog (no focus trap).
 * Everything behind the backdrop is still tabbable. Fine for a single dialog in
 * a small app; swap in a focus-trap primitive before stacking dialogs.
 */
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

    // `tabIndex={-1}` on the dialog makes it a valid fallback focus target.
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
