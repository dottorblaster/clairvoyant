/** Trim whitespace and a leading `@` from a user-typed handle. */
export const normalizeHandle = (value: string): string => value.trim().replace(/^@/, '')

/** The API's OAuth entry point, with an optional post-login return path. */
export const buildLoginUrl = (handle: string, returnTo?: string): string => {
  const params = new URLSearchParams({ handle })
  if (returnTo !== undefined && returnTo !== '') params.set('return_to', returnTo)
  return `/oauth/login?${params.toString()}`
}

/** The shareable per-person invite link for an event. */
export const buildInviteUrl = (origin: string, path: string, token: string): string =>
  `${origin}${path}?invite=${token}`
