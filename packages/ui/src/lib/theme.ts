/** `auto` follows the operating system; the other two pin a theme. */
export type ThemeMode = 'auto' | 'light' | 'dark'

/** The theme actually painted on screen once `auto` is resolved. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'clairvoyant.theme'

export const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark']

export const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
}

/** Anything unrecognised (missing, corrupt, user-edited) falls back to `auto`. */
export const parseThemeMode = (value: unknown): ThemeMode =>
  value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'

export const resolveTheme = (mode: ThemeMode, prefersLight: boolean): ResolvedTheme =>
  mode === 'auto' ? (prefersLight ? 'light' : 'dark') : mode

/** `auto -> light -> dark -> auto`, so the toggle walks through every option. */
export const nextThemeMode = (mode: ThemeMode): ThemeMode => {
  const index = THEME_MODES.indexOf(mode)
  return THEME_MODES[(index + 1) % THEME_MODES.length] ?? 'auto'
}

/**
 * `localStorage` throws in some privacy modes and is absent during SSR, so every
 * access is guarded. The design system degrades to `auto` rather than crashing.
 */
export const readStoredThemeMode = (): ThemeMode => {
  try {
    return parseThemeMode(globalThis.localStorage?.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

export const writeStoredThemeMode = (mode: ThemeMode): void => {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Persistence is a nice-to-have; ignore quota/security errors.
  }
}

export const prefersLightTheme = (): boolean =>
  globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false

/**
 * Paints the stored theme onto `<html data-theme>`. Called once before the first
 * render so there is no flash of the wrong theme. CSS also carries a
 * `prefers-color-scheme` fallback for the case where this never runs.
 */
export const initTheme = (root: HTMLElement = document.documentElement): ResolvedTheme => {
  const resolved = resolveTheme(readStoredThemeMode(), prefersLightTheme())
  root.dataset.theme = resolved
  return resolved
}
