import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@shared-vps/database';
import { fail,locked,SubscriptionEngine } from './engine.js';
import { PaymentFoundation } from './payment-foundation.js';
import { verifiedSandboxObservation } from './payment-provider.js';
import { LegalService } from './legal-service.js';
import { requireChannel,type Channel,type Context,type SandboxAdapter,type Headers,type Evidence } from './integration-adapters.js';
/** Durable server-only sandbox coordinator. Live purchases remain unrepresentable in DB. */
export class IntegrationService {
 readonly payments:PaymentFoundation;
 constructor(private db:PrismaClient,private adapter:SandboxAdapter,private legal=new LegalService(db),engine=new SubscriptionEngine(db)){this.payments=new PaymentFoundation(db,engine);}
 private async context(id:string):Promise<Context>{const op=await this.db.paymentOperation.findUniqueOrThrow({where:{id},include:{order:{include:{user:{include:{identities:true}}}}}});if(op.mode!=='SANDBOX'||op.provider!==this.adapter.name)fail(409,'PAYMENT_SOURCE_MISMATCH');return {id:op.id,orderId:op.orderId,amount:op.amount,currency:op.currency as 'XTR'|'RUB',externalId:op.externalId,state:op.status as Context['state'],telegramId:op.order.user.identities.find(i=>i.provider==='TELEGRAM')?.providerUserId};}
 async register(userId:string,orderId:string,channel:Channel,starsQuote?:number){
  requireChannel(this.adapter.name,channel);await this.legal.requireAccepted(userId,orderId,channel);
  return locked(this.db,async tx=>{
   const order=await tx.order.findFirst({where:{id:orderId,userId},include:{payments:true,user:{include:{identities:true}}}});if(!order)fail(404,'ORDER_NOT_FOUND');
   const currency=this.adapter.currency,amount=currency==='XTR'?starsQuote:order.amount;
   if(!Number.isSafeInteger(amount)||Number(amount)<=0)fail(400,'EXPLICIT_STARS_QUOTE_REQUIRED');
   if(currency==='XTR'&&!order.user.identities.some(i=>i.provider==='TELEGRAM'))fail(409,'TELEGRAM_IDENTITY_REQUIRED');
   const prior=await tx.paymentOperation.findUnique({where:{orderId}});if(prior){if(prior.provider!==this.adapter.name||prior.amount!==amount)fail(409,'PAYMENT_KEY_REUSED');return prior;}
   if(order.status!=='AWAITING_PAYMENT'||order.payments.length!==1||order.payments[0]!.status!=='PENDING')fail(409,'PAYMENT_ALREADY_STARTED');
   const id=randomUUID();return tx.paymentOperation.create({data:{id,orderId,paymentId:order.payments[0]!.id,key:'vendor-sandbox:'+orderId,provider:this.adapter.name,mode:'SANDBOX',externalId:'pending:'+id,amount:amount!,currency}});
  });
 }
 async create(id:string){return this.outbound(id,'CREATE');}
 async refund(id:string){return this.outbound(id,'REFUND');}
 private async outbound(id:string,kind:'CREATE'|'REFUND'){
  const c=await this.context(id),token=randomUUID();
  if(kind==='CREATE'){const op=await this.db.paymentOperation.findUniqueOrThrow({where:{id},include:{order:true}});await this.legal.requireAccepted(op.order.userId,op.orderId,this.adapter.name==='STARS_SANDBOX'?'TELEGRAM':'WEBSITE');}
  const claim=await locked(this.db,async tx=>{
   const op=await tx.paymentOperation.findUniqueOrThrow({where:{id},include:{order:true}});
   if(kind==='CREATE'&&(op.status!=='PENDING'||op.order.status!=='AWAITING_PAYMENT'))fail(409,'PAYMENT_ALREADY_STARTED');
   if(kind==='REFUND'&&op.status!=='SUCCEEDED')fail(409,'CAPTURE_REQUIRED');
   const prior=await tx.providerAttempt.findUnique({where:{operationId_kind:{operationId:id,kind}}});
   if(prior){if(prior.status==='SUCCEEDED')return {done:prior};if(prior.status==='RUNNING'&&prior.leaseUntil&&prior.leaseUntil.getTime()>Date.now())fail(409,'PROVIDER_OPERATION_BUSY');await tx.providerAttempt.update({where:{id:prior.id},data:{status:'UNKNOWN',lastError:'RECONCILIATION_REQUIRED'}});return {unknown:true};}
   const attempt=await tx.providerAttempt.create({data:{operationId:id,kind,key:'provider:'+id+':'+kind,status:'RUNNING',leaseToken:token,leaseUntil:new Date(Date.now()+30000)}});return {attempt};
  });
  if('done' in claim)return {status:'SUCCEEDED',url:claim.done!.checkoutUrl};
  if('unknown' in claim)fail(409,'PROVIDER_OUTCOME_UNKNOWN');
  const attempt=claim.attempt!;
  // Network calls MUST remain outside locked database transactions.
  try{
   let checkout:Awaited<ReturnType<SandboxAdapter['create']>>|null=null;
   if(kind==='CREATE')checkout=await this.adapter.create(c,attempt.key);else await this.adapter.refund(c,attempt.key);
   await locked(this.db,async tx=>{
    const lease=await tx.providerAttempt.findFirst({where:{id:attempt.id,status:'RUNNING',leaseToken:token}});if(!lease)fail(409,'PROVIDER_LEASE_LOST');
    if(checkout){const op=await tx.paymentOperation.findUniqueOrThrow({where:{id}});if(op.externalId.startsWith('pending:'))await tx.paymentOperation.update({where:{id},data:{externalId:checkout.externalId}});else if(op.externalId!==checkout.externalId&&!['STARS_SANDBOX','CLOUDPAYMENTS_SANDBOX'].includes(op.provider))fail(409,'PAYMENT_SOURCE_MISMATCH');}
    await tx.providerAttempt.update({where:{id:attempt.id},data:{status:'SUCCEEDED',checkoutUrl:checkout?.url??null,leaseToken:null,leaseUntil:null,lastError:null}});
   });
   // A successful refund REQUEST is not yet financial evidence. Wait for callback/reconciliation.
   return {status:'SUCCEEDED',url:checkout?.url??null};
  }catch{
   await this.db.providerAttempt.updateMany({where:{id:attempt.id,status:'RUNNING',leaseToken:token},data:{status:'UNKNOWN',leaseToken:null,leaseUntil:null,lastError:'RECONCILIATION_REQUIRED'}});
   fail(503,'PROVIDER_OUTCOME_UNKNOWN');
  }
 }
 private async record(c:Context,e:Evidence){
  // Bind once, under the same global lock as the journal. Signature + order/amount/user checks happened first.
  await locked(this.db,async tx=>{const op=await tx.paymentOperation.findUniqueOrThrow({where:{id:c.id}});
   if(op.externalId.startsWith('pending:')||op.provider==='CLOUDPAYMENTS_SANDBOX'&&op.externalId.startsWith('invoice:'))await tx.paymentOperation.update({where:{id:c.id},data:{externalId:e.externalId}});
   else if(op.externalId!==e.externalId)fail(409,'PAYMENT_SOURCE_MISMATCH');
  });
  const event=await this.payments.accept(verifiedSandboxObservation({...e,operationId:c.id,mode:'SANDBOX',provider:this.adapter.name}));await this.payments.process(event.id);return event;
 }
 async receive(id:string,raw:string,headers:Headers){
  const c=await this.context(id),e=await this.adapter.verify(raw,headers,c);
  // Rolly has late transitions and delivery timestamps, not event sequence numbers. Read authoritative state.
  const current=this.adapter.name==='ROLLYPAY_SANDBOX'?await this.adapter.observe({...c,externalId:e.externalId}):e;
  if(!current)fail(503,'PROVIDER_RECONCILIATION_REQUIRED');return this.record(c,current);
 }
 async reconcile(id:string){for(let i=0;i<(this.adapter.name==='ROLLYPAY_SANDBOX'?1:2);i++){const c=await this.context(id),e=await this.adapter.observe(c);if(!e)break;await this.record(c,e);}return this.payments.audit(id);}
 /** Bounded recovery after a crash. Never blindly retries an outbound request. */
 async recover(cursor?:string){
  const rows=await this.db.providerAttempt.findMany({where:{status:{in:['RUNNING','UNKNOWN']},...(cursor?{id:{gt:cursor}}:{})},orderBy:{id:'asc'},take:50});
  for(const r of rows){if(r.status==='RUNNING'&&r.leaseUntil&&r.leaseUntil.getTime()>Date.now())continue;await this.db.providerAttempt.updateMany({where:{id:r.id,status:{in:['RUNNING','UNKNOWN']}},data:{status:'UNKNOWN',lastError:'RECONCILIATION_REQUIRED'}});try{await this.reconcile(r.operationId);}catch{/* UNKNOWN remains visible, no network errors or secrets persisted. */}}
  return rows.length===50?rows.at(-1)!.id:undefined;
 }
}
