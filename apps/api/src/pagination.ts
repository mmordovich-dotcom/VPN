import { createHash } from 'node:crypto';
import type { PrismaClient } from '@shared-vps/database';
import { fail } from './engine.js';
export type ListQuery = { limit?: number; cursor?: string; search?: string; status?: string; sort?: 'newest' | 'oldest'; includeTotal?: boolean };
export const listSchema = { type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:50,default:20},cursor:{type:'string',maxLength:1024},search:{type:'string',maxLength:80},status:{type:'string',maxLength:32},sort:{enum:['newest','oldest'],default:'newest'},includeTotal:{type:'boolean',default:false}} } as const;
export const resources = ['users','orders','subscriptions','servers','tickets','events','jobs'] as const;
export type Resource = typeof resources[number];
const allowedStatuses: Record<Resource,readonly string[]> = {users:['ACTIVE','BLOCKED','ARCHIVED'],orders:['AWAITING_PAYMENT','PAID','PROCESSING','COMPLETED','FAILED','CANCELLED'],subscriptions:['PENDING','ACTIVE','SUSPENDED','EXPIRED','CANCELLED'],servers:['PROVISIONING','ACTIVE','SUSPENDED','FAILED','TERMINATED'],tickets:['OPEN','WAITING_ADMIN','IN_PROGRESS','WAITING_PROVIDER','WAITING_USER','CLOSED'],events:[],jobs:['PENDING','PROCESSING','DONE','DEAD','SKIPPED']};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = { id:string;createdAt:Date } & Record<string,unknown>;
type Delegate = {findMany(args:Record<string,unknown>):Promise<Row[]>;count(args:Record<string,unknown>):Promise<number>};
export function pageSpec(resource:Resource,query:ListQuery,scope='admin') {
  const limit=query.limit??20; if(!Number.isInteger(limit)||limit<1||limit>50)fail(400,'INVALID_PAGE');
  const search=query.search?.trim()??''; if(search.length>80)fail(400,'INVALID_PAGE');
  const status=query.status??'';if(status&&!allowedStatuses[resource].includes(status))fail(400,'INVALID_FILTER');
  const sort=query.sort??'newest';if(!['newest','oldest'].includes(sort))fail(400,'INVALID_PAGE');
  const fingerprint=createHash('sha256').update(JSON.stringify([resource,search,status,sort,scope])).digest('hex').slice(0,24);
  let after: {id:string;at:Date}|undefined;
  if(query.cursor){try{const parsed=JSON.parse(Buffer.from(query.cursor,'base64url').toString()) as Record<string,unknown>;if(parsed.f!==fingerprint||typeof parsed.id!=='string'||!uuid.test(parsed.id)||typeof parsed.at!=='string'||!Number.isFinite(Date.parse(parsed.at)))throw Error();after={id:parsed.id,at:new Date(parsed.at)};}catch{fail(400,'INVALID_CURSOR');}}
  const direction=sort==='newest'?'desc':'asc';
  return {limit,search,status,direction,fingerprint,after} as const;
}
export async function listRecords(db:PrismaClient,resource:Resource,query:ListQuery,userId?:string) {
  if(userId&&!['orders','subscriptions','tickets'].includes(resource))fail(403,'ADMIN_REQUIRED');
  const spec=pageSpec(resource,query,userId??'admin');
  const fields:Record<Resource,Record<string,unknown>>={
    users:{id:true,role:true,status:true,createdAt:true,identities:{where:{provider:'TELEGRAM'},take:3,select:{providerUserId:true}},_count:{select:{subscriptions:true}}},
    orders:{id:true,userId:!userId,status:true,amount:true,currency:true,lastError:true,createdAt:true,payments:{take:5,orderBy:{createdAt:'desc'},select:{status:true}}},
    subscriptions:{id:true,userId:!userId,status:true,expiresAt:true,createdAt:true,plan:{select:{name:true}}},
    servers:{id:true,externalServerId:true,status:true,capacity:true,expiresAt:true,createdAt:true,slots:{take:100,orderBy:{slotNumber:'asc'},select:{slotNumber:true,status:true}}},
    tickets:{id:true,userId:!userId,number:true,text:true,category:true,status:true,createdAt:true,updatedAt:true},
    events:{id:true,actorUserId:true,action:true,entityType:true,entityId:true,createdAt:true},
    jobs:{id:true,kind:true,key:true,status:true,attempts:true,maxAttempts:true,runAt:true,leaseUntil:true,lastError:true,createdAt:true,finishedAt:true},
  };
  const names={users:'user',orders:'order',subscriptions:'subscription',servers:'server',tickets:'supportTicket',events:'auditLog',jobs:'backgroundJob'} as const;
  // Only this fixed mapping selects delegates/fields. No client field names enter a Prisma query.
  const delegate=db[names[resource]] as unknown as Delegate;
  const base:Record<string,unknown>={...(userId?{userId}:{}),...(spec.status?{status:spec.status}:{})};
  if(spec.search){const contains={contains:spec.search,mode:'insensitive'};const choices:Record<string,unknown>[]=[];
    if(uuid.test(spec.search))choices.push({id:spec.search});
    if(resource==='users')choices.push({identities:{some:{provider:'TELEGRAM',providerUserId:contains}}});
    if(resource==='servers')choices.push({externalServerId:contains});
    if(resource==='tickets'){choices.push({text:contains});if(/^\d{1,9}$/.test(spec.search))choices.push({number:Number(spec.search)});}
    if(resource==='events')choices.push({action:contains});
    if(resource==='jobs')choices.push({key:contains},{kind:contains});
    if(['orders','subscriptions'].includes(resource)&&uuid.test(spec.search)&&!userId)choices.push({userId:spec.search});
    base.OR=choices.length?choices:[{id:'00000000-0000-0000-0000-000000000000'}];
  }
  const comparison=spec.direction==='desc'?'lt':'gt';
  const where=spec.after?{AND:[base,{OR:[{createdAt:{[comparison]:spec.after.at}},{createdAt:spec.after.at,id:{[comparison]:spec.after.id}}]}]}:base;
  const rows=await delegate.findMany({where,select:fields[resource],orderBy:[{createdAt:spec.direction},{id:spec.direction}],take:spec.limit+1});
  const more=rows.length>spec.limit;const items=rows.slice(0,spec.limit);const last=items.at(-1);
  return {items,nextCursor:more&&last?Buffer.from(JSON.stringify({f:spec.fingerprint,id:last.id,at:last.createdAt.toISOString()})).toString('base64url'):null,
    ...(query.includeTotal?{total:await delegate.count({where:base})}:{}),limit:spec.limit};
}
