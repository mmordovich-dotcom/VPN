import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@shared-vps/database';
import { SubscriptionEngine, locked, fail } from './engine.js';
import { databaseNow } from './job-queue.js';
export interface ResourceRequest { operationKey:string; resourceId:string; capacity:number; maximumCostMinor:number; currency:'RUB' }
export type ResourceLookup={state:'FOUND';externalId:string}|{state:'ABSENT'}|{state:'UNKNOWN'};
/** Separate durable protocol; existing ServerProvider and DEMO engine stay compatible. */
export interface DurableMockServerProvider { readonly mode:'SANDBOX'; readonly name:'MOCK'; create(request:ResourceRequest):Promise<string>; lookup(request:ResourceRequest):Promise<ResourceLookup> }
export const durableMockServerProvider:DurableMockServerProvider={mode:'SANDBOX',name:'MOCK',async create(r){return 'demo:vps:'+r.resourceId;},async lookup(r){return {state:'FOUND',externalId:'demo:vps:'+r.resourceId};}};
export class ResourceFoundation {
  constructor(private db:PrismaClient,private engine=new SubscriptionEngine(db),private provider:DurableMockServerProvider=durableMockServerProvider,private budgetMinor=200000){
    if(provider.mode!=='SANDBOX'||provider.name!=='MOCK')fail(403,'LIVE_RESOURCES_DISABLED');
    if(!Number.isSafeInteger(budgetMinor)||budgetMinor<0)fail(400,'INVALID_RESOURCE_BUDGET');
  }
  async reserve(orderId:string){
    return locked(this.db,async tx=>{
      await this.engine.expire(tx);
      const order=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{plan:true,renewal:true}});
      if(order.status!=='PAID')return null;
      if(order.renewal?.status==='ACTIVE')return null;
      const prior=await tx.resourceReservation.findUnique({where:{orderId}});if(prior)return prior;
      const slot=await tx.serverSlot.findFirst({where:{status:'AVAILABLE',slotNumber:{lte:3},server:{status:'ACTIVE',capacity:{lte:Math.min(3,order.plan.maxUsersPerServer)},currency:'RUB'},subscriptions:{none:{status:{in:['PENDING','ACTIVE','SUSPENDED']}}}},orderBy:[{serverId:'asc'},{slotNumber:'asc'}]});
      if(slot){await tx.serverSlot.update({where:{id:slot.id},data:{status:'RESERVED'}});return tx.resourceReservation.create({data:{orderId,serverSlotId:slot.id,slotNumber:slot.slotNumber}});}
      const pending=await tx.resourceOperation.findMany({where:{status:{in:['PENDING','RUNNING','UNKNOWN']},capacity:{lte:Math.min(3,order.plan.maxUsersPerServer)}},include:{reservations:{where:{status:'HELD'}}},orderBy:{id:'asc'},take:100});
      for(const op of pending){
        const seat=Array.from({length:op.capacity},(_,i)=>i+1).find(i=>!op.reservations.some(r=>r.slotNumber===i));
        if(seat)return tx.resourceReservation.create({data:{orderId,operationId:op.id,slotNumber:seat}});
      }
      const settings=await tx.setting.findMany();const setting=(key:string,fallback:number)=>Number(settings.find(s=>s.key===key)?.value??fallback);
      const capacity=Math.min(3,order.plan.maxUsersPerServer,setting('server.default_capacity',3));const monthlyCost=setting('server.monthly_cost_minor',20000);
      if(!Number.isSafeInteger(capacity)||capacity<1||!Number.isSafeInteger(monthlyCost)||monthlyCost<0)fail(409,'INVALID_RESOURCE_QUOTE');
      const active=await tx.server.aggregate({where:{status:{in:['ACTIVE','SUSPENDED','PROVISIONING']},currency:'RUB'},_sum:{monthlyCost:true}});
      const held=await tx.resourceOperation.aggregate({where:{status:{in:['PENDING','RUNNING','UNKNOWN']}},_sum:{monthlyCost:true}});
      if((active._sum.monthlyCost??0)+(held._sum.monthlyCost??0)+monthlyCost>this.budgetMinor)fail(409,'RESOURCE_BUDGET_EXCEEDED');
      const id=randomUUID();const op=await tx.resourceOperation.create({data:{id,key:'mock-resource:'+id,capacity,monthlyCost}});
      return tx.resourceReservation.create({data:{orderId,operationId:op.id,slotNumber:1}});
    });
  }
  async prepare(operationId:string){
    const claim=await locked(this.db,async tx=>{
      const op=await tx.resourceOperation.findUniqueOrThrow({where:{id:operationId}});const now=await databaseNow(tx);
      if(op.status==='SUCCEEDED')return null;
      if(op.status==='FAILED')fail(409,'RESOURCE_FAILED');
      if(op.status==='RUNNING'&&op.leaseUntil&&op.leaseUntil>now)fail(503,'RESOURCE_BUSY');
      const reconcile=op.status==='UNKNOWN'||op.status==='RUNNING';
      const token=randomUUID();await tx.resourceOperation.update({where:{id:op.id},data:{status:'RUNNING',leaseToken:token,leaseUntil:new Date(now.getTime()+30000)}});
      return {op,token,reconcile};
    });
    if(!claim)return;
    const {op,token,reconcile}=claim;const request:ResourceRequest={operationKey:op.key,resourceId:op.id,capacity:op.capacity,maximumCostMinor:op.monthlyCost,currency:'RUB'};
    try {
      // No PostgreSQL transaction or allocation lock exists during either provider call.
      // Unknown/expired attempts are read back, NEVER blindly created a second time.
      const result=reconcile?await this.provider.lookup(request):null;
      if(result?.state==='UNKNOWN'||result?.state==='ABSENT')fail(503,'RESOURCE_RESULT_UNKNOWN');
      const externalId=result?.state==='FOUND'?result.externalId:await this.provider.create(request);
      if(!/^demo:vps:[a-f0-9-]{36}$/.test(externalId))fail(409,'MOCK_RESOURCE_ID_REQUIRED');
      await locked(this.db,async tx=>{
        const current=await tx.resourceOperation.findUniqueOrThrow({where:{id:op.id}});const now=await databaseNow(tx);
        if(current.leaseToken!==token||current.status!=='RUNNING'||!current.leaseUntil||current.leaseUntil<=now)fail(503,'RESOURCE_LEASE_LOST');
        const server=await tx.server.create({data:{id:op.id,externalServerId:externalId,status:'ACTIVE',capacity:op.capacity,monthlyCost:op.monthlyCost,rentedAt:now,expiresAt:new Date(now.getTime()+30*86400000)}});
        const reservations=await tx.resourceReservation.findMany({where:{operationId:op.id,status:'HELD'}});
        for(let number=1;number<=op.capacity;number++){const reserved=reservations.find(r=>r.slotNumber===number);const slot=await tx.serverSlot.create({data:{serverId:server.id,slotNumber:number,status:reserved?'RESERVED':'AVAILABLE'}});if(reserved)await tx.resourceReservation.update({where:{id:reserved.id},data:{serverSlotId:slot.id}});}
        await tx.resourceOperation.update({where:{id:op.id},data:{status:'SUCCEEDED',serverId:server.id,externalId,leaseToken:null,leaseUntil:null,lastError:null}});
      });
    }catch(error){
      // If PostgreSQL is unavailable this marker may also fail; the persisted lease still forces lookup on restart.
      try{await this.db.resourceOperation.updateMany({where:{id:op.id,status:'RUNNING',leaseToken:token},data:{status:'UNKNOWN',leaseToken:null,leaseUntil:null,lastError:'RESOURCE_RESULT_UNKNOWN'}});}catch{/* Lease is durable. */}
      throw error;
    }
  }
  async fulfill(orderId:string){
    const reservation=await this.reserve(orderId);
    if(reservation?.status==='RELEASED')fail(409,'RESERVATION_RELEASED');
    if(reservation?.operationId)await this.prepare(reservation.operationId);
    return this.engine.fulfill(orderId);
  }
}
