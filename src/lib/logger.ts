type LogLevel = 'info' | 'warn' | 'error'

interface LogMeta {
  [key: string]: unknown
}

function emit(level: LogLevel, route: string, message: string, meta?: LogMeta) {
  const entry = {
    level,
    route,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ? { meta } : {}),
  }

  const line = JSON.stringify(entry)

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (route: string, message: string, meta?: LogMeta) => emit('info', route, message, meta),
  warn: (route: string, message: string, meta?: LogMeta) => emit('warn', route, message, meta),
  error: (route: string, message: string, meta?: LogMeta) => emit('error', route, message, meta),
}
