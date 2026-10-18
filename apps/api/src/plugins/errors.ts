import { DomainError } from '../engine.js';
import type { FastifyInstance } from 'fastify';
export function registerErrors(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const candidate = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
    request.log.error({ requestId: request.id, statusCode: status }, 'Request failed');
    void reply.code(status).send({ error: error instanceof DomainError ? error.code : status === 500 ? 'Internal server error' : 'Invalid request', requestId: request.id });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found' }));
}
