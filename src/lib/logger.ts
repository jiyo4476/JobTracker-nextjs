/**
 * Structured multi-level logger for server-side use (API routes, middleware).
 *
 * Levels (low → high): trace | debug | info | warn | error
 * Set LOG_LEVEL env var to control minimum level. Defaults to "debug" in
 * development and "info" in production.
 *
 * Output is newline-delimited JSON so log aggregators (Vercel, Datadog, etc.)
 * can parse it without extra configuration.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
}

function resolveMinLevel(): number {
  const raw = process.env.LOG_LEVEL as LogLevel | undefined
  if (raw && raw in LEVELS) return LEVELS[raw]
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug
}

// Resolve once at module load; changing LOG_LEVEL at runtime has no effect.
const MIN_LEVEL = resolveMinLevel()

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  }
  const line = JSON.stringify(entry)
  // console.* works in both the Node.js runtime (API routes) and the Edge
  // Runtime (middleware). process.stdout/stderr are Node.js-only.
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export interface Logger {
  trace(msg: string, ctx?: Record<string, unknown>): void
  debug(msg: string, ctx?: Record<string, unknown>): void
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
  /** Return a child logger that merges extra fields into every log entry. */
  child(defaults: Record<string, unknown>): Logger
}

function makeLogger(defaults: Record<string, unknown> = {}): Logger {
  function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    emit(level, msg, { ...defaults, ...ctx })
  }
  return {
    trace: (msg, ctx) => log('trace', msg, ctx),
    debug: (msg, ctx) => log('debug', msg, ctx),
    info:  (msg, ctx) => log('info',  msg, ctx),
    warn:  (msg, ctx) => log('warn',  msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
    child: (extra) => makeLogger({ ...defaults, ...extra }),
  }
}

export const logger = makeLogger()

/**
 * Serialize an unknown caught value into structured fields for error logging.
 * Preserves message, name, and stack rather than collapsing to String(err).
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { errName: err.name, errMsg: err.message, stack: err.stack }
  }
  return { err: String(err) }
}
