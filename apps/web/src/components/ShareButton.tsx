import { Button } from '@clairvoyant/ui'
import { useState } from 'react'

export interface ShareButtonProps {
  /** Absolute URL to share. Must not carry an invite token. */
  url: string
  /** Title handed to the native share sheet. */
  title: string
}

interface ShareData {
  title: string
  url: string
}

type NativeShare = (data: ShareData) => Promise<void>

const COPY_FEEDBACK_MS = 1_500

/**
 * `navigator.share` is not present in every DOM lib/@types combination, so it is
 * read through a narrow structural check instead of relying on `lib.dom`.
 */
const nativeShare = (): NativeShare | null => {
  const candidate = (navigator as { share?: unknown }).share
  return typeof candidate === 'function' ? (candidate as NativeShare) : null
}

/**
 * Shares the current event link. Uses the native share sheet where the browser
 * has one, and otherwise copies the link to the clipboard with a short "Copied"
 * confirmation.
 */
export const ShareButton = ({ url, title }: ShareButtonProps) => {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    const clipboard = navigator.clipboard
    if (!clipboard) return
    clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
      })
      .catch(() => setCopied(false))
  }

  const onClick = () => {
    const share = nativeShare()
    if (share === null) {
      copy()
      return
    }

    share({ title, url }).catch((error: unknown) => {
      // Dismissing the share sheet rejects with AbortError: that is a deliberate
      // "no", not a failure, so we must not silently copy instead.
      if (error instanceof Error && error.name === 'AbortError') return
      copy()
    })
  }

  return (
    <Button icon="share" onClick={onClick}>
      {copied ? 'Copied' : 'Share'}
    </Button>
  )
}
