import type { MiddlewareHandler } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import type { Env } from './env.js'

export const createSecurityHeaders = (env: Env): MiddlewareHandler =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity:
      env.NODE_ENV === 'production' ? 'max-age=31536000; includeSubDomains' : false,
    xContentTypeOptions: true,
    xFrameOptions: 'DENY',
    referrerPolicy: 'no-referrer',
    crossOriginResourcePolicy: 'same-origin',
    crossOriginOpenerPolicy: 'same-origin',
    removePoweredBy: true,
  })
