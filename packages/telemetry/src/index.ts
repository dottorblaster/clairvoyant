import {
  type Attributes,
  type Meter,
  metrics,
  type Span,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api'

// Telemetry is opt-in: the SDK is only imported once OTEL_EXPORTER_OTLP_ENDPOINT
// is set, so an unconfigured deploy pays nothing at startup.
export const INSTRUMENTATION_NAME = 'clairvoyant'

export interface StartTelemetryOptions {
  serviceName: string
  serviceVersion?: string
  env?: NodeJS.ProcessEnv
}

export interface TelemetryHandle {
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

export const isTelemetryEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.OTEL_SDK_DISABLED !== 'true' && Boolean(configuredEndpoint(env))

let current: TelemetryHandle | null = null

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
