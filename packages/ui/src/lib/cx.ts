/** A class name, or a falsy value to omit. */
export type ClassValue = string | false | null | undefined

/**
 * Joins conditional class names. Falsy values are dropped, so callers can write
 * `cx('btn', isPrimary && 'btn--primary')` without tracking empty strings.
 */
export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ')
