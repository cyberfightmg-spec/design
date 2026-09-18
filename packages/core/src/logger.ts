import { createLogger, format, transports } from 'winston';
import type { LogContext } from './types.js';
import { env } from './config.js';

const { combine, timestamp, json, colorize, printf } = format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const ctx = Object.entries(meta)
    .filter(([k]) => !['service'].includes(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return `${ts} [${level}] ${message}${ctx ? ' ' + ctx : ''}`;
});

const baseLogger = createLogger({
  level: env.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  transports: [
    new transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? json()
        : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
    }),
  ],
});

export function createContextLogger(context: LogContext) {
  return {
    info: (message: string, extra?: Record<string, unknown>) =>
      baseLogger.info(message, { ...context, ...extra }),
    warn: (message: string, extra?: Record<string, unknown>) =>
      baseLogger.warn(message, { ...context, ...extra }),
    error: (message: string, extra?: Record<string, unknown>) =>
      baseLogger.error(message, { ...context, ...extra }),
    debug: (message: string, extra?: Record<string, unknown>) =>
      baseLogger.debug(message, { ...context, ...extra }),
  };
}

export const logger = createContextLogger({});
