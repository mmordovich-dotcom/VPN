import { randomUUID } from 'node:crypto';
import { mkdtemp,mkdir,cp,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it,expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/seed.js';

it('Stage 1.9 additive migration preserves Stage 1.8 users, prices, server capacity, subscriptions, orders and support',async()=>{
 const raw=process.env.TEST_DATABASE_URL;if(!raw)throw Error('TEST_DATABASE_URL required');const parsed=new URL(raw);if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('Disposable CI PostgreSQL only');
 const schema='migration19_'+randomUUID().replaceAll('-','');const admin=new PrismaClient({datasources:{db:{url:raw}}});const directory=await mkdtemp(join(tmpdir(),'axon-migration19-'));let db:PrismaClient|undefined;
 try {
  await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');parsed.searchParams.set('schema',schema);const url=parsed.toString();const current=fileURLToPath(new URL('../prisma/',import.meta.url));
  await mkdir(join(directory,'migrations'),{recursive:true});await cp(join(current,'schema.prisma'),join(directory,'schema.prisma'));await cp(join(current,'migrations','migration_lock.toml'),join(directory,'migrations','migration_lock.toml'),{recursive:true});
  for(const name of await readdir(join(current,'migrations')))if(name!=='migration_lock.toml'&&!name.startsWith('20261108'))await cp(join(current,'migrations',name),join(directory,'migrations',name),{recursive:true});
  const deploy=(schemaFile:string)=>execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/prisma/build/index.js',import.meta.url)),'migrate','deploy','--schema',schemaFile],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
  deploy(join(directory,'schema.prisma'));db=new PrismaClient({datasources:{db:{url}}});const plan=await seedDatabase(db);const user=await db.user.create({data:{}});const o=await db.order.create({data:{userId:user.id,planId:plan.id,status:'COMPLETED',amount:17000,currency:'RUB'}});
  await db.payment.create({data:{orderId:o.id,amount:17000,status:'SUCCEEDED',externalPaymentId:'demo:legacy:'+o.id}});const server=await db.server.create({data:{status:'ACTIVE',capacity:3,monthlyCost:20000}});const slot=await db.serverSlot.create({data:{serverId:server.id,slotNumber:1,status:'OCCUPIED'}});await db.subscription.create({data:{userId:user.id,planId:plan.id,orderId:o.id,serverSlotId:slot.id,status:'ACTIVE',startedAt:new Date(),expiresAt:new Date(Date.now()+30*86400000)}});await db.supportTicket.create({data:{userId:user.id,text:'Preserve this support history'}});
  const snapshot=async()=>JSON.stringify(await Promise.all([db!.user.findMany(),db!.plan.findMany(),db!.order.findMany(),db!.payment.findMany(),db!.server.findMany(),db!.serverSlot.findMany(),db!.subscription.findMany(),db!.supportTicket.findMany(),db!.setting.findMany({orderBy:{id:'asc'}})]));const before=await snapshot();deploy(join(current,'schema.prisma'));expect(await snapshot()).toBe(before);expect(await db.paymentOperation.count()).toBe(0);expect(await db.resourceOperation.count()).toBe(0);const migrations=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;expect(Number(migrations[0]!.count)).toBe(6);
 }finally{await db?.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect();await rm(directory,{recursive:true,force:true});}
},60000);
