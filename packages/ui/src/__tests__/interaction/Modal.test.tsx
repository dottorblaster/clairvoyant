// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { Button, Modal, type ModalProps } from '../../../dist/index.js'

const renderModal = (props: Partial<ModalProps> = {}) => {
  const onClose = vi.fn()
  const result = render(
    <Modal title="Invite someone" onClose={onClose} {...props}>
      body
    </Modal>,
  )
  return { onClose, ...result }
}

describe('Modal DOM behaviour', () => {
  test('renders an accessible, labelled dialog', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Invite someone')
  })

  test('closes on Escape', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('ignores other keys', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  test('closes through the backdrop, which is a real button', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('closes through the close control', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('locks body scroll while open and restores it on close', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = renderModal()

    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  test('focuses the dialog when no initial target is given', () => {
    renderModal()
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  test('focuses the initial target when one is given', () => {
    const Harness = () => {
      const inputRef = useRef<HTMLInputElement>(null)
      return (
        <Modal title="Invite" onClose={() => {}} initialFocusRef={inputRef}>
          <input ref={inputRef} aria-label="Their handle" />
        </Modal>
      )
    }

    render(<Harness />)
    expect(document.activeElement).toBe(screen.getByLabelText('Their handle'))
  })

  test('restores focus to the previously focused element on close', () => {
    const { unmount } = render(
      <div>
        <Button>Open</Button>
      </div>,
    )
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const modal = render(
      <Modal title="Dialog" onClose={() => {}}>
        body
      </Modal>,
    )
    expect(document.activeElement).not.toBe(opener)

    modal.unmount()
    expect(document.activeElement).toBe(opener)
    unmount()
  })
})
