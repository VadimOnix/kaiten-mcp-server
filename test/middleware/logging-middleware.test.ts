import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as loggerModule from '../../src/logging/index.js';
import { logHttpRequest, logHttpResponse, logHttpError } from '../../src/middleware/logging-middleware.js';

describe('logging-middleware', () => {
  let recordMetric: ReturnType<typeof vi.spyOn>;
  let debug: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    recordMetric = vi.spyOn(loggerModule.logger, 'recordMetric').mockImplementation(() => {});
    debug = vi.spyOn(loggerModule.logger, 'debug').mockImplementation(() => {});
    error = vi.spyOn(loggerModule.logger, 'error').mockImplementation(() => {});
    delete process.env.KAITEN_LOG_REQUESTS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KAITEN_LOG_REQUESTS;
  });

  it('logHttpResponse records a success metric with latency', () => {
    logHttpResponse({ method: 'get', url: '/x', status: 200, durationMs: 42 });
    expect(recordMetric).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'http_request', latency_ms: 42, success: true }),
    );
  });

  it('logHttpError records a failure metric with the error message', () => {
    logHttpError({ method: 'get', url: '/x', status: 500, durationMs: 7, message: 'boom' });
    expect(error).toHaveBeenCalled();
    expect(recordMetric).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'http_request', success: false, error: 'boom' }),
    );
  });

  it('logHttpRequest is silent unless KAITEN_LOG_REQUESTS=true', () => {
    logHttpRequest({ method: 'get', url: '/x' });
    expect(debug).not.toHaveBeenCalled();

    process.env.KAITEN_LOG_REQUESTS = 'true';
    logHttpRequest({ method: 'get', url: '/x' });
    expect(debug).toHaveBeenCalledWith('HTTP Request', expect.objectContaining({ method: 'GET', url: '/x' }), 'http-client');
  });
});
