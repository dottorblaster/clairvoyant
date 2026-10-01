import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createLogger, type LogLevel } from '../dist/logger.js'

interface Captured {
  log: string[]
  warn: string[]
  error: string[]
}

const captureConsole = (run: () => void): Captured => {
  const captured: Captured = { log: [], warn: [], error: [] }
  const original = { log: console.log, warn: console.warn, error: console.error }
  console.log = (line: string) => captured.log.push(line)
  console.warn = (line: string) => captured.warn.push(line)
  console.error = (line: string) => captured.error.push(line)
  try {
    run()
  } finally {
    console.log = original.log
    console.warn = original.warn
    console.error = original.error
  }
  return captured
}

const parse = (line: string): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>

describe('createLogger level filtering', () => {
  test('suppresses entries below the threshold', () => {
    const captured = captureConsole(() => {
      const log = createLogger('warn')
      log.debug('d')
      log.info('i')
      log.warn('w')
      log.error('e')
    })

    assert.deepEqual(captured.log, [])
    assert.equal(captured.warn.length, 1)
    assert.equal(captured.error.length, 1)
  })

  test('emits everything at debug', () => {
    const captured = captureConsole(() => {
      const log = createLogger('debug')
      for (const level of ['debug', 'info', 'warn', 'error'] as LogLevel[]) log[level]('x')
    })

    assert.equal(captured.log.length, 2)
    assert.equal(captured.warn.length, 1)
    assert.equal(captured.error.length, 1)
  })
})

describe('createLogger payload', () => {
  test('writes JSON with level, ISO time, message and bindings', () => {
    const captured = captureConsole(() => {
      createLogger('info', { app: 'api' }).info('hello', { port: 3000 })
    })

    const payload = parse(captured.log[0] ?? '')
    assert.equal(payload.level, 'info')
    assert.equal(payload.message, 'hello')
    assert.equal(payload.app, 'api')
    assert.equal(payload.port, 3000)
    assert.equal(typeof payload.time, 'string')
    assert.ok(!Number.isNaN(Date.parse(payload.time as string)))
  })

  test('routes each level to the matching console method', () => {
    const captured = captureConsole(() => {
      const log = createLogger('debug')
      log.debug('d')
      log.warn('w')
      log.error('e')
    })

    assert.equal(parse(captured.log[0] ?? '').level, 'debug')
    assert.equal(parse(captured.warn[0] ?? '').level, 'warn')
    assert.equal(parse(captured.error[0] ?? '').level, 'error')
  })

  test('serialises an Error under err', () => {
    const captured = captureConsole(() => {
      createLogger('error').error('failed', { err: new Error('boom') })
    })

    const err = parse(captured.error[0] ?? '').err as Record<string, unknown>
    assert.equal(err.name, 'Error')
    assert.equal(err.message, 'boom')
    assert.equal(typeof err.stack, 'string')
  })

  test('passes a non-Error err through unchanged', () => {
    const captured = captureConsole(() => {
      createLogger('error').error('failed', { err: 'nope' })
    })

    assert.equal(parse(captured.error[0] ?? '').err, 'nope')
  })

  test('meta wins over bindings on a key collision', () => {
    const captured = captureConsole(() => {
      createLogger('info', { scope: 'binding' }).info('m', { scope: 'meta' })
    })

    assert.equal(parse(captured.log[0] ?? '').scope, 'meta')
  })
})
