import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@shared-vps/database';
import { IntegrationService } from './integration-service.js';
import { TelegramStarsSandbox,type SandboxAdapter,type Headers } from './integration-adapters.js';
import { LegalService } from './legal-service.js';
import { fail } from './engine.js';
/** Explicitly installed by a dedicated test harness ONLY. Not registered by production buildApp. */
export async function sandboxWebhooks(app:FastifyInstance,db:PrismaClient,adapter:SandboxAdapter,legal:LegalService,isolation:'INDEPENDENT_TEST_ENVIRONMENT'){
 if(isolation!=='INDEPENDENT_TEST_ENVIRONMENT'||process.env.NODE_ENV==='production')throw new Error('SANDBOX_ISOLATION_REQUIRED');
 const scope=await db.$queryRaw<{schema:string}[]>`SELECT current_schema() AS schema`;
 if(!/^stage20_[a-f0-9]{32}$/.test(scope[0]?.schema??''))throw new Error('SANDBOX_DATABASE_SCOPE_REQUIRED');
 const service=new IntegrationService(db,adapter,legal);
 await app.register(async scope=>{
  scope.setErrorHandler((error,_req,reply)=>{const status=/UNTRUSTED|SOURCE_MISMATCH|ENVIRONMENT_MISMATCH/.test(error instanceof Error?error.message:'')?403:503;return reply.code(status).send({error:status===403?'UNTRUSTED_PROVIDER_EVENT':'SANDBOX_EVENT_UNAVAILABLE'});});
  scope.removeContentTypeParser('application/json');
  scope.addContentTypeParser(['application/json','application/x-www-form-urlencoded'],{parseAs:'string',bodyLimit:32768},(_req,body,done)=>done(null,String(body)));
  scope.post<{Params:{kind:string};Body:string}>('/sandbox/webhooks/:kind',async(req,reply)=>{
   reply.header('cache-control','no-store');const raw=req.body;
   const headers:Headers={};for(const key of ['x-timestamp','x-signature','x-test-mode','content-hmac','x-telegram-bot-api-secret-token'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key] as string;
   // Kind comes from the configured URL, never a user-supplied header/body field.
   if(adapter.name==='CLOUDPAYMENTS_SANDBOX'){if(!['pay','refund','fail'].includes(req.params.kind))fail(404,'UNKNOWN_PROVIDER_EVENT');headers['axon-event']=req.params.kind;}
   else if(req.params.kind!=='event')fail(404,'UNKNOWN_PROVIDER_EVENT');
   let value:Record<string,unknown>;try{value=adapter.name==='CLOUDPAYMENTS_SANDBOX'?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw) as Record<string,unknown>;}catch{fail(400,'INVALID_PROVIDER_EVENT');}
   if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'INVALID_PROVIDER_EVENT');
   if(adapter instanceof TelegramStarsSandbox){
    adapter.authenticate(headers);
    const q=value.pre_checkout_query as {id:string;from:{id:number};invoice_payload:string;currency:string;total_amount:number}|undefined;
    if(q){
     if(typeof q.id!=='string'||q.id.length>180||!q.from||!Number.isSafeInteger(q.from.id))fail(400,'INVALID_PROVIDER_EVENT');
     const op=typeof q.invoice_payload==='string'&&/^[a-f0-9-]{36}$/.test(q.invoice_payload)?await db.paymentOperation.findUnique({where:{id:q.invoice_payload},include:{order:{include:{user:{include:{identities:true}}}}}}):null;
     let approved=false;if(op&&op.provider===adapter.name&&op.mode==='SANDBOX'&&op.status==='PENDING'&&op.order.status==='AWAITING_PAYMENT')try{await legal.requireAccepted(op.order.userId,op.orderId,'TELEGRAM');approved=true;}catch{/* Negative answer; no debit or activation. */}
     const context=op?{id:op.id,orderId:op.orderId,amount:op.amount,currency:'XTR' as const,externalId:op.externalId,telegramId:op.order.user.identities.find(i=>i.provider==='TELEGRAM')?.providerUserId}:{id:'invalid',orderId:'invalid',amount:0,currency:'XTR' as const,externalId:'invalid'};
     await adapter.preCheckout(q,context,approved);return {ok:true};
    }
    const m=value.message as Record<string,unknown>|undefined,p=(m?.successful_payment??m?.refunded_payment) as Record<string,unknown>|undefined;
    if(!p)return {ok:true};if(typeof p.invoice_payload!=='string'||!/^[a-f0-9-]{36}$/.test(p.invoice_payload))fail(400,'INVALID_PROVIDER_EVENT');await service.receive(p.invoice_payload,raw,headers);return {ok:true};
   }
   const orderId=adapter.name==='ROLLYPAY_SANDBOX'?value.order_id:value.InvoiceId;
   if(typeof orderId!=='string'||!/^[a-f0-9-]{36}$/.test(orderId))fail(400,'INVALID_PROVIDER_EVENT');
   const op=await db.paymentOperation.findUnique({where:{orderId}});if(!op||op.provider!==adapter.name)fail(404,'UNKNOWN_PAYMENT');
   await service.receive(op.id,raw,headers);return adapter.name==='CLOUDPAYMENTS_SANDBOX'?{code:0}:{ok:true};
  });
 });
 return service;
}

export function createSandboxApp(){return Fastify();}
