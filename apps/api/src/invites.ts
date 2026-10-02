import { createHash, randomBytes } from 'node:crypto'

// Only the SHA-256 hash is persisted, so a database leak does not expose usable
// invite links.
export const generateInviteToken = (): string => randomBytes(32).toString('base64url')

export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('base64url')
