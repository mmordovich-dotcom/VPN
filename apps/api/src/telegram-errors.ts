import { JobFailure } from './job-queue.js';
export class TelegramFailure extends JobFailure {
  constructor(code: 'TELEGRAM_RETRY' | 'TELEGRAM_BLOCKED' | 'TELEGRAM_PERMANENT' | 'TELEGRAM_DELIVERY_UNKNOWN', retryAfterMs = 0) {
    super(code, code === 'TELEGRAM_BLOCKED' || code === 'TELEGRAM_PERMANENT', retryAfterMs, code === 'TELEGRAM_DELIVERY_UNKNOWN');
  }
}
export function telegramFailure(status: number, retryAfter?: number) {
  if (status === 403) return new TelegramFailure('TELEGRAM_BLOCKED');
  if (status === 429 || status >= 500) return new TelegramFailure('TELEGRAM_RETRY', Math.max(0, Math.min(3600, retryAfter ?? 0)) * 1000);
  return new TelegramFailure('TELEGRAM_PERMANENT');
}
