import { logger } from '../logging/index.js';

const requestsEnabled = (): boolean => process.env.KAITEN_LOG_REQUESTS === 'true';

export function logHttpRequest(info: { method: string; url: string }): void {
  if (requestsEnabled()) {
    logger.debug('HTTP Request', { method: info.method.toUpperCase(), url: info.url }, 'http-client');
  }
}

export function logHttpResponse(info: {
  method: string;
  url: string;
  status: number;
  durationMs: number;
}): void {
  if (requestsEnabled()) {
    logger.debug('HTTP Response', {
      method: info.method.toUpperCase(),
      url: info.url,
      status: info.status,
      duration_ms: info.durationMs,
    }, 'http-client');
  }

  logger.recordMetric({
    tool: 'http_request',
    latency_ms: info.durationMs,
    success: true,
    timestamp: new Date().toISOString(),
  });
}

export function logHttpError(info: {
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  message: string;
}): void {
  logger.error('HTTP Response Error', {
    method: info.method.toUpperCase(),
    url: info.url,
    status: info.status,
    duration_ms: info.durationMs,
    message: info.message,
  }, 'http-client');

  logger.recordMetric({
    tool: 'http_request',
    latency_ms: info.durationMs,
    success: false,
    timestamp: new Date().toISOString(),
    error: info.message,
  });
}
