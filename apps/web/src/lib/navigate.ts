export const navigateTo = (url: string): void => {
  window.location.assign(url)
}

export const currentReturnTo = (): string => window.location.pathname + window.location.search
