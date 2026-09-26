type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  requestId?: string
  module?: string
  action?: string
  actor?: string
  [key: string]: unknown
}

/**
 * Structured JSON logs (docs/03 §7). Pass ids, never personal data (emails, names, phones).
 */
export function log(level: Level, message: string, fields: LogFields = {}): void {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
