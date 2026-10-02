import { Button } from '@clairvoyant/ui'
import { useState } from 'react'

export interface ShareButtonProps {
  url: string
  title: string
}

interface ShareData {
  title: string
  url: string
}

type NativeShare = (data: ShareData) => Promise<void>

const COPY_FEEDBACK_MS = 1_500

const nativeShare = (): NativeShare | null => {
  const candidate = (navigator as { share?: unknown }).share
  return typeof candidate === 'function' ? (candidate as NativeShare) : null
}

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
      // Dismissing the share sheet rejects with AbortError; that is a "no", not a failure.
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
