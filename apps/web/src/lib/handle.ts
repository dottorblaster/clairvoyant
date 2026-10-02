export const normalizeHandle = (value: string): string => value.trim().replace(/^@/, '')

export const buildLoginUrl = (handle: string, returnTo?: string): string => {
  const params = new URLSearchParams({ handle })
  if (returnTo !== undefined && returnTo !== '') params.set('return_to', returnTo)
  return `/oauth/login?${params.toString()}`
}

export const buildInviteUrl = (origin: string, path: string, token: string): string =>
  `${origin}${path}?invite=${token}`
