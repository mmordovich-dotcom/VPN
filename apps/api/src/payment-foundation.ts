import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@shared-vps/database';
import { SubscriptionEngine, locked, fail } from './engine.js';
import { enqueue } from './job-queue.js';
import { assertTestObservation, type PaymentObservation, type PaymentProvider, type TestProvider } from './payment-provider.js';

/** Server-only test foundation. Deliberately has no public HTTP route. */
export class PaymentFoundation {
  constructor(private db:PrismaClient, private engine=new SubscriptionEngine(db)) {}
  async register(orderId:string, provider:TestProvider, quote?:{amount:number;currency:'XTR'}) {
    if(!['STARS_TEST','SBP_MOCK','EXTERNAL_TEST'].includes(provider)) fail(403,'LIVE_PAYMENTS_DISABLED');
    return locked(this.db,async tx=>{
      const order=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{payments:true}});
      const amount=provider==='STARS_TEST'?quote?.amount:order.amount;
      const currency=provider==='STARS_TEST'?'XTR':order.currency;
      if(!Number.isSafeInteger(amount)||Number(amount)<=0||currency!==(provider==='STARS_TEST'?'XTR':'RUB'))fail(400,'INVALID_TEST_QUOTE');
      const prior=await tx.paymentOperation.findUnique({where:{orderId}});
      if(prior){if(prior.provider!==provider||prior.amount!==amount||prior.currency!==currency)fail(409,'PAYMENT_KEY_REUSED');return prior;}
      const payment=order.payments[0];
      if(order.status!=='AWAITING_PAYMENT'||!payment||payment.status!=='PENDING')fail(409,'PAYMENT_ALREADY_STARTED');
      const id=randomUUID();
      return tx.paymentOperation.create({data:{id,orderId,paymentId:payment.id,key:'sandbox:'+orderId,provider,mode:'SANDBOX',externalId:'test:'+id,amount:amount!,currency}});
    });
  }
  async receive(provider:PaymentProvider,raw:string,authentication:string){
    if(provider.mode!=='SANDBOX')fail(403,'LIVE_PAYMENTS_DISABLED');
    // Verification outside any database transaction. Ack is safe only after receive succeeds.
    return this.accept(await provider.verify(raw,authentication));
  }
  async accept(observation:PaymentObservation){
    assertTestObservation(observation);
    const digest=createHash('sha256').update(JSON.stringify(observation)).digest('hex');
    return locked(this.db,async tx=>{
      const op=await tx.paymentOperation.findUniqueOrThrow({where:{id:observation.operationId}});
      if(op.mode!=='SANDBOX'||op.provider!==observation.provider||op.externalId!==observation.externalId)fail(409,'PAYMENT_SOURCE_MISMATCH');
      const prior=await tx.paymentEvent.findUnique({where:{operationId_eventId:{operationId:op.id,eventId:observation.eventId}}});
      if(prior){if(prior.digest!==digest)fail(409,'EVENT_ID_REUSED');return prior;}
      const valid=op.amount===observation.amount&&op.currency===observation.currency;
      const event=await tx.paymentEvent.create({data:{operationId:op.id,eventId:observation.eventId,digest,kind:observation.state,amount:observation.amount,currency:observation.currency,processing:{create:{status:valid?'PENDING':'REJECTED',lastError:valid?null:'AMOUNT_CURRENCY_MISMATCH'}}}});
      if(valid)await enqueue(tx,'PAYMENT_EVENT','payment-event:'+event.id,{eventId:event.id});
      return event;
    });
  }
  async process(eventId:string){
    return locked(this.db,async tx=>{
      const event=await tx.paymentEvent.findUniqueOrThrow({where:{id:eventId},include:{processing:true,operation:{include:{order:true}}}});
      if(event.processing?.status!=='PENDING')return;
      const op=event.operation;
      const mark=(status:string,lastError:string|null=null)=>tx.paymentEventProcessing.update({where:{eventId},data:{status,lastError}});
      if(op.amount!==event.amount||op.currency!==event.currency)return mark('REJECTED','AMOUNT_CURRENCY_MISMATCH');
      const capture=await tx.financialEntry.findUnique({where:{key:op.id+':CAPTURE'}});
      if(event.kind==='REFUNDED'&&!capture)return mark('PENDING','CAPTURE_REQUIRED');
      if(event.kind===op.status || op.status==='REFUNDED' || ['FAILED','CANCELLED'].includes(op.status) || op.status==='SUCCEEDED'&&event.kind!=='REFUNDED')return mark('IGNORED');
      const action=event.kind==='SUCCEEDED'?'confirm':event.kind==='REFUNDED'?'refund':event.kind==='FAILED'?'fail':event.kind==='CANCELLED'?'cancel':null;
      if(action)await this.engine.applyPaymentIn(tx,op.order.userId,op.orderId,action,true,true);
      await tx.paymentOperation.update({where:{id:op.id},data:{status:event.kind}});
      const kind=event.kind==='SUCCEEDED'?'CAPTURE':event.kind==='REFUNDED'?'REFUND':'STATE';
      await tx.financialEntry.create({data:{operationId:op.id,eventId:event.id,key:op.id+':'+(kind==='STATE'?event.id:kind),kind,amount:event.amount,currency:event.currency}});
      return mark('APPLIED');
    });
  }
  async recover(cursor?:string){
    const pending=await this.db.paymentEventProcessing.findMany({where:{status:'PENDING',...(cursor?{eventId:{gt:cursor}}:{})},take:100,orderBy:{eventId:'asc'}});
    for(const row of pending)await this.process(row.eventId);
    return pending.length===100?pending.at(-1)!.eventId:undefined;
  }
  async reconcile(provider:PaymentProvider,operationId:string){
    const op=await this.db.paymentOperation.findUniqueOrThrow({where:{id:operationId}});
    if(provider.mode!=='SANDBOX'||provider.name!==op.provider||op.mode!=='SANDBOX')fail(403,'LIVE_PAYMENTS_DISABLED');
    // Unknown provider response is NOT proof of failure and must never trigger fulfillment.
    const observation=await provider.observe(op.key);
    if(observation){if(observation.operationId!==op.id)fail(409,'PAYMENT_SOURCE_MISMATCH');const event=await this.accept(observation);await this.process(event.id);}
    return this.db.paymentOperation.findUniqueOrThrow({where:{id:operationId}});
  }
  async audit(operationId:string){
    const op=await this.db.paymentOperation.findUniqueOrThrow({where:{id:operationId},include:{order:true,ledger:true,payment:true}});
    const captures=op.ledger.filter(e=>e.kind==='CAPTURE');const refunds=op.ledger.filter(e=>e.kind==='REFUND');
    return {operationId:op.id,status:op.status,captured:captures.reduce((s,e)=>s+e.amount,0),refunded:refunds.reduce((s,e)=>s+e.amount,0),currency:op.currency,consistent:captures.length<=1&&refunds.length<=1&&refunds.length<=captures.length&&(op.status!=='SUCCEEDED'||op.payment.status==='SUCCEEDED'&&['PAID','COMPLETED'].includes(op.order.status))&&(op.status!=='REFUNDED'||op.payment.status==='REFUNDED'&&op.order.status==='CANCELLED')};
  }
}
