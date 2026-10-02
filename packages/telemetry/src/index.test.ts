import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import {
  getMeter,
  isTelemetryEnabled,
  shutdownTelemetry,
  startTelemetry,
  withSpan,
} from '../dist/index.js'

afterEach(async () => {
  await shutdownTelemetry()
})

describe('isTelemetryEnabled', () => {
  test('is off without any endpoint', () => {
    assert.equal(isTelemetryEnabled({}), false)
  })

  test('is on when any OTLP endpoint is set', () => {
    assert.equal(isTelemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318' }), true)
    assert.equal(
      isTelemetryEnabled({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://c:4318/v1/traces' }),
      true,
    )
    assert.equal(
      isTelemetryEnabled({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://c:4318/v1/metrics' }),
      true,
    )
  })

  test('is off when OTEL_SDK_DISABLED is true, even with an endpoint', () => {
    assert.equal(
      isTelemetryEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318',
        OTEL_SDK_DISABLED: 'true',
      }),
      false,
    )
  })
})

describe('startTelemetry', () => {
  test('is a no-op without an endpoint, so the SDK is never loaded', async () => {
    const handle = await startTelemetry({ serviceName: 'clairvoyant-test', env: {} })
    assert.equal(handle.enabled, false)
    await handle.shutdown()
  })

  test('returns the same handle when called twice', async () => {
    const first = await startTelemetry({ serviceName: 'clairvoyant-test', env: {} })
    const second = await startTelemetry({ serviceName: 'clairvoyant-test', env: {} })
    assert.equal(first, second)
  })

  test('shuts down safely when telemetry was never enabled', async () => {
    await startTelemetry({ serviceName: 'clairvoyant-test', env: {} })
    await shutdownTelemetry()
    await shutdownTelemetry()
  })
})

describe('withSpan', () => {
  test('returns the callback result and hands it a span', async () => {
    const result = await withSpan('test.span', (span) => {
      assert.equal(typeof span.end, 'function')
      return 42
    })
    assert.equal(result, 42)
  })

  test('propagates a thrown error', async () => {
    await assert.rejects(
      withSpan('test.span', () => {
        throw new Error('boom')
      }),
      /boom/,
    )
  })
})

describe('getMeter', () => {
  test('returns a usable meter even with no provider', () => {
    const counter = getMeter().createCounter('clairvoyant.test')
    counter.add(1)
    assert.equal(typeof counter.add, 'function')
  })
})
