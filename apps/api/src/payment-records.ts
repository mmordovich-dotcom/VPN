import { createHash } from 'node:crypto';
import type { Prisma } from '@shared-vps/database';
type Tx=Prisma.TransactionClient;
export async function recordDemoPayment(tx:Tx, payment:{id:string;orderId:string;amount:number;currency:string}, event:string, status:string) {
  const state=event==='cancel'?'CANCELLED':status;
  const operation=await tx.paymentOperation.upsert({where:{orderId:payment.orderId},create:{orderId:payment.orderId,paymentId:payment.id,key:'demo:'+payment.id,provider:'DEMO_TEST',mode:'DEMO',externalId:'demo:payment:'+payment.orderId,amount:payment.amount,currency:payment.currency,status:state},update:{status:state}});
  const key='demo:'+event;
  const prior=await tx.paymentEvent.findUnique({where:{operationId_eventId:{operationId:operation.id,eventId:key}}});
  if(prior)return;
  const evidence=await tx.paymentEvent.create({data:{operationId:operation.id,eventId:key,digest:createHash('sha256').update(payment.id+':'+event).digest('hex'),kind:state,amount:payment.amount,currency:payment.currency,processing:{create:{status:'APPLIED'}}}});
  const kind=status==='SUCCEEDED'?'CAPTURE':status==='REFUNDED'?'REFUND':'STATE';
  await tx.financialEntry.create({data:{operationId:operation.id,eventId:evidence.id,key:operation.id+':'+(kind==='STATE'?key:kind),kind,amount:payment.amount,currency:payment.currency}});
}
export async function releaseReservation(tx:Tx,orderId:string){
  const held=await tx.resourceReservation.findUnique({where:{orderId}});
  if(held?.status!=='HELD')return;
  await tx.resourceReservation.update({where:{id:held.id},data:{status:'RELEASED'}});
  if(held.serverSlotId && !await tx.subscription.count({where:{serverSlotId:held.serverSlotId,status:{in:['PENDING','ACTIVE','SUSPENDED']}}})) await tx.serverSlot.update({where:{id:held.serverSlotId},data:{status:'AVAILABLE'}});
}
