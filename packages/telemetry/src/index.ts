/**
 * Optional OpenTelemetry bootstrap.
 *
 * The app emits traces and metrics to any OTLP endpoint a deployer points it at,
 * and does **nothing at all** when none is configured. That is the whole point:
 * self-hosters get observability for free by setting `OTEL_EXPORTER_OTLP_ENDPOINT`,
 * and everyone else pays no startup cost — the OpenTelemetry SDK is only
 * `import()`ed once an endpoint is present.
 *
 * Configured entirely through the standard `OTEL_*` environment variables, so
 * there is nothing bespoke to learn:
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT   e.g. http://localhost:4318   (required to enable)
 *   OTEL_EXPORTER_OTLP_PROTOCOL   http/protobuf (default) | grpc
 *   OTEL_SERVICE_NAME             overrides the per-app default
 *   OTEL_SDK_DISABLED=true        hard off, even with an endpoint
 */
import {
  type Attributes,
  type Meter,
  metrics,
  type Span,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api'

/** The instrumentation scope every span and metric is attributed to. */
export const INSTRUMENTATION_NAME = 'clairvoyant'

export interface StartTelemetryOptions {
  /** Fallback used when `OTEL_SERVICE_NAME` is not set. */
  serviceName: string
  serviceVersion?: string
  /** Override the process environment. Used by tests. */
  env?: NodeJS.ProcessEnv
}

export interface TelemetryHandle {
  /** `false` when no OTLP endpoint was configured, so nothing was started. */
  enabled: boolean
  shutdown(): Promise<void>
}

const NOOP_HANDLE: TelemetryHandle = {
  enabled: false,
  async shutdown() {},
}

const configuredEndpoint = (env: NodeJS.ProcessEnv): string | undefined =>
  env.OTEL_EXPORTER_OTLP_ENDPOINT ??
  env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
  env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT

/**
 * Telemetry starts only when an OTLP endpoint is configured and the SDK has not
 * been explicitly disabled. With nowhere to export to, returning a no-op keeps
 * the SDK out of the process entirely.
 */
export const isTelemetryEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.OTEL_SDK_DISABLED !== 'true' && Boolean(configuredEndpoint(env))

let current: TelemetryHandle | null = null

/**
 * Start the SDK, or return a no-op when telemetry is not configured. Idempotent:
 * repeated calls (for example from a `--import` preload and then the entry point)
 * return the same handle.
 */
export const startTelemetry = async (options: StartTelemetryOptions): Promise<TelemetryHandle> => {
  if (current !== null) return current

  const env = options.env ?? process.env
  if (!isTelemetryEnabled(env)) {
    current = NOOP_HANDLE
    return current
  }

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/exporter-metrics-otlp-http'),
    import('@opentelemetry/sdk-metrics'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
  ])

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME ?? options.serviceName,
      ...(options.serviceVersion === undefined
        ? {}
        : { [ATTR_SERVICE_VERSION]: options.serviceVersion }),
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
  })

  sdk.start()

  current = {
    enabled: true,
    shutdown: () => sdk.shutdown(),
  }
  return current
}

/** Flush and stop the SDK. Safe to call when telemetry was never enabled. */
export const shutdownTelemetry = async (): Promise<void> => {
  const handle = current
  current = null
  await handle?.shutdown()
}

const tracer = (): Tracer => trace.getTracer(INSTRUMENTATION_NAME)

export const getMeter = (): Meter => metrics.getMeter(INSTRUMENTATION_NAME)

export const recordError = (span: Span, error: unknown): void => {
  span.recordException(error instanceof Error ? error : new Error(String(error)))
  span.setStatus({ code: SpanStatusCode.ERROR })
}

/**
 * Run `fn` inside an active span. When no provider is registered (telemetry off)
 * the OpenTelemetry API hands back a non-recording span, so this stays cheap and
 * the callback result is returned unchanged.
 */
export const withSpan = async <T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Attributes,
): Promise<T> =>
  tracer().startActiveSpan(name, async (span) => {
    if (attributes !== undefined) span.setAttributes(attributes)
    try {
      return await fn(span)
    } catch (error) {
      recordError(span, error)
      throw error
    } finally {
      span.end()
    }
  })

export type { Attributes, Meter, Span, Tracer }
export { metrics, SpanStatusCode, trace }
