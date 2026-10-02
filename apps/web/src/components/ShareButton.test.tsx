import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { ShareButton } from './ShareButton'

const URL = 'http://localhost/p/did:plc:author/e/abc'
const TITLE = 'Launch party'

const installClipboard = (): ReturnType<typeof vi.fn> => {
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

const installShare = (share: (data: unknown) => Promise<void>): void => {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(navigator, 'share')
})

const render = () => renderWithProviders(<ShareButton url={URL} title={TITLE} />)

describe('ShareButton', () => {
  test('opens the native share sheet when the browser has one', async () => {
    const share = vi.fn(async () => undefined)
    installShare(share)

    render()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL }))
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
  })

  test('copies the link when native sharing is unavailable', async () => {
    const writeText = installClipboard()

    render()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  test('does not copy when the share sheet is dismissed', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    installShare(async () => {
      throw abort
    })
    const writeText = installClipboard()

    render()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy())
    expect(writeText).not.toHaveBeenCalled()
  })

  test('falls back to copying when sharing fails for another reason', async () => {
    installShare(async () => {
      throw new Error('no share target')
    })
    const writeText = installClipboard()

    render()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  test('stays usable when neither the share sheet nor the clipboard exists', () => {
    render()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
  })
})
