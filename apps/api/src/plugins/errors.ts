import { DomainError } from '../engine.js';
import type { FastifyInstance } from 'fastify';
export function errorCategory(status:number){return status>=500?'system':status===429?'rate-limit':status===401||status===403?'authorization':status===409?'conflict':status===404?'not-found':'validation';}
export function registerErrors(app:FastifyInstance){
  app.setErrorHandler((error,request,reply)=>{
    const candidate=error instanceof Error&&'statusCode' in error?error.statusCode:undefined;
    const databaseUnavailable=error instanceof Error&&'code' in error&&['P1001','P1002','P1008','P1017','P2024'].includes(String(error.code));
    const status=databaseUnavailable?503:typeof candidate==='number'&&candidate>=400&&candidate<500?candidate:error instanceof DomainError&&typeof candidate==='number'&&candidate>=500&&candidate<=503?candidate:500;
    const metadata={requestId:request.id,statusCode:status,category:errorCategory(status)};
    if(status>=500)request.log.error(metadata,'System request failure');else request.log.info(metadata,'Request rejected');
    reply.header('x-request-id',request.id);
    void reply.code(status).send({error:error instanceof DomainError?error.code:status===503?'Service temporarily unavailable':status===500?'Internal server error':'Invalid request',requestId:request.id});
  });
  app.setNotFoundHandler((request,reply)=>reply.header('x-request-id',request.id).code(404).send({error:'Not found',requestId:request.id}));
}
