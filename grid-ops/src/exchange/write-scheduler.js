const RATE_LIMIT_CODES = new Set([
  '429', '418', '-1003', 'too_many_requests', 'rate_limit', 'rate_limited',
  'ratelimited', 'throttled', 'request_limit_exceeded',
]);

function sleepDefault(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  return [error?.exchangeCode, error?.code, error?.diagnosticCode, error?.message]
    .filter((value) => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase();
}

export function isExplicitRateLimitError(error) {
  if (!error || error.statusUnknown) return false;
  const status = Number(error.httpStatus ?? error.status);
  if (status === 429 || status === 418) return true;
  const code = String(error.exchangeCode ?? error.code ?? error.diagnosticCode ?? '').toLowerCase();
  if (RATE_LIMIT_CODES.has(code)) return true;
  return /too[ _-]*many[ _-]*requests|rate[ _-]*limit|请求过于频繁|触发限流|限流/.test(errorText(error));
}

export function retryAfterMsFromHeaders(headers, now = Date.now()) {
  const raw = headers?.get?.('retry-after');
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const at = Date.parse(raw);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const reset = Number(headers?.get?.('x-ratelimit-reset') || headers?.get?.('x-rate-limit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const at = reset > 1e12 ? reset : reset * 1000;
    return Math.max(0, at - now);
  }
  return null;
}

/**
 * Per-account queue for state-changing exchange requests.
 *
 * It serializes writes, enforces a minimum start-to-start gap and retries only
 * explicit rate-limit rejections. Transport timeouts and 5xx responses are not
 * retried here because their execution state may be unknown and replaying them
 * could duplicate a real order.
 */
export class ExchangeWriteScheduler {
  constructor({
    label = '交易所', minGapMs = 250, maxRetries = 5,
    baseDelayMs = 1200, maxDelayMs = 30000,
    sleep = sleepDefault, now = Date.now,
  } = {}) {
    this.label = label;
    this.minGapMs = Math.max(0, Number(minGapMs) || 0);
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.baseDelayMs = Math.max(100, Number(baseDelayMs) || 1200);
    this.maxDelayMs = Math.max(this.baseDelayMs, Number(maxDelayMs) || 30000);
    this.sleep = sleep;
    this.now = now;
    this.tail = Promise.resolve();
    this.lastStartedAt = 0;
    this.cooldownUntil = 0;
  }

  reset() {
    this.tail = Promise.resolve();
    this.lastStartedAt = 0;
    this.cooldownUntil = 0;
  }

  run(task, { operation = '写请求', maxRetries = this.maxRetries, minGapMs = this.minGapMs } = {}) {
    const job = this.tail.then(
      () => this._execute(task, { operation, maxRetries, minGapMs }),
      () => this._execute(task, { operation, maxRetries, minGapMs }),
    );
    this.tail = job.then(() => undefined, () => undefined);
    return job;
  }

  async _waitForSlot(minGapMs) {
    const target = Math.max(this.cooldownUntil, this.lastStartedAt + Math.max(0, Number(minGapMs) || 0));
    const wait = target - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStartedAt = this.now();
  }

  async _execute(task, { operation, maxRetries, minGapMs }) {
    let attempt = 0;
    while (true) {
      await this._waitForSlot(minGapMs);
      try {
        const result = await task({ attempt });
        this.cooldownUntil = 0;
        return result;
      } catch (error) {
        if (!isExplicitRateLimitError(error) || attempt >= maxRetries) {
          if (isExplicitRateLimitError(error)) {
            error.diagnosticCode ||= 'EXCHANGE_RATE_LIMITED';
            error.message = `${error.message}；${this.label}${operation}已自动限速并退避重试 ${attempt} 次，仍被限流，请稍后再试。`;
          }
          throw error;
        }
        const headerDelay = Number(error.retryAfterMs);
        const exponential = this.baseDelayMs * (2 ** attempt);
        const delay = Math.min(this.maxDelayMs, Math.max(
          this.minGapMs,
          Number.isFinite(headerDelay) && headerDelay >= 0 ? headerDelay : exponential,
        ));
        attempt++;
        this.cooldownUntil = this.now() + delay;
      }
    }
  }
}
