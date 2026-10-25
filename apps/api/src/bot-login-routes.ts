import type { FastifyInstance } from 'fastify';
import type { BotLogin } from './bot-login.js';
const requestBody = { type: 'object', additionalProperties: false, required: ['requestId'], properties: { requestId: { type: 'string', format: 'uuid' } } } as const;
export function botLoginRoutes(app: FastifyInstance, login: BotLogin) {
  app.post('/api/v1/auth/bot/request', { schema: { body: { type: 'object', additionalProperties: false, properties: {} } } }, (req, reply) => login.request(req, reply));
  app.post<{ Body: { requestId: string } }>('/api/v1/auth/bot/status', { schema: { body: requestBody } }, req => login.status(req, req.body.requestId));
  app.post<{ Body: { requestId: string } }>('/api/v1/auth/bot/complete', { schema: { body: requestBody } }, (req, reply) => login.complete(req, reply, req.body.requestId));
  app.post<{ Body: { requestId: string } }>('/api/v1/auth/bot/cancel', { schema: { body: requestBody } }, req => login.cancel(req, req.body.requestId));
  app.post<{ Body: { code: string } }>('/api/v1/auth/code', { schema: { body: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: { type: 'string', maxLength: 64 } } } } }, (req, reply) => login.code(req, reply, req.body.code));
  app.post<{ Body: { token: string } }>('/api/v1/auth/link', { schema: { body: { type: 'object', additionalProperties: false, required: ['token'], properties: { token: { type: 'string', maxLength: 128 } } } } }, (req, reply) => login.link(req, reply, req.body.token));
}
