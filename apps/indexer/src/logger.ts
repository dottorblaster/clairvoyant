export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

const serializeError = (value: unknown): unknown => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

export const createLogger = (level: LogLevel, bindings: Record<string, unknown> = {}): Logger => {
  const threshold = LEVEL_ORDER[level]

  const emit = (entryLevel: LogLevel, message: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[entryLevel] < threshold) {
      return
    }

    const payload: Record<string, unknown> = {
      level: entryLevel,
      time: new Date().toISOString(),
      message,
      ...bindings,
      ...meta,
    }
    if (payload.err !== undefined) payload.err = serializeError(payload.err)
    const line = JSON.stringify(payload)
    if (entryLevel === 'error') console.error(line)
    else if (entryLevel === 'warn') console.warn(line)
    else console.log(line)
  }

  return {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
  }
}
