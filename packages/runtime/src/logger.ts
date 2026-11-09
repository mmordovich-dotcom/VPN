import pino from 'pino';
export const loggerOptions = {
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'token', 'leaseToken', 'payload', 'code', 'req.body.token', 'req.body.code', 'password', 'DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'req.headers["x-telegram-bot-api-secret-token"]', 'TELEGRAM_WEBHOOK_SECRET', 'idToken', 'initData', 'INTERNAL_MONITOR_TOKEN', 'apiKey', 'signingSecret', 'apiSecret', 'req.headers["x-api-key"]', 'req.headers["x-signature"]', 'req.headers["content-hmac"]'],
    censor: '[REDACTED]',
  },
};
export function createLogger(service: string, level = 'info') {
  return pino({ ...loggerOptions, level, base: { service } });
}
