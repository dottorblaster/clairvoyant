// The cookie carries only the user DID. It is HMAC-signed so a client cannot
// forge another user's DID, and it is not an access token: the OAuth session
// (DPoP keys included) stays server-side.
import { createHmac, timingSafeEqual } from 'node:crypto'

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url')

const decode = (value: string): string => Buffer.from(value, 'base64url').toString('utf8')

const sign = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url')

export const serializeSession = (secret: string, did: string): string => {
  const payload = encode(did)
  return `${payload}.${sign(secret, payload)}`
}

export const parseSession = (secret: string, cookieValue: string | undefined): string | null => {
  if (!cookieValue) return null
  const separator = cookieValue.lastIndexOf('.')
  if (separator <= 0) return null

  const payload = cookieValue.slice(0, separator)
  const signature = cookieValue.slice(separator + 1)
  if (payload.length === 0 || signature.length === 0) return null

  const expected = sign(secret, payload)
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null

  try {
    const did = decode(payload)
    return did.startsWith('did:') ? did : null
  } catch {
    return null
  }
}
