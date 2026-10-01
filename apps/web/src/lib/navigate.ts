/**
 * Full-page navigation seam.
 *
 * `window.location.assign` is non-configurable in jsdom, so tests mock this
 * module instead of the browser API. Keeping the call here also means the
 * redirect target is always built by a pure function (`buildLoginUrl`).
 */
export const navigateTo = (url: string): void => {
  window.location.assign(url)
}

/** The current location as a same-origin relative return path. */
export const currentReturnTo = (): string => window.location.pathname + window.location.search
