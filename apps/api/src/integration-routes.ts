import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@shared-vps/database';
import type { Auth } from './auth.js';
import { LegalService } from './legal-service.js';
import { INTEGRATION_READINESS } from './integration-readiness.js';
/** No purchase/checkout route is exposed while account and legal gates are unverified. */
export function integrationRoutes(app:FastifyInstance,db:PrismaClient,auth:Auth){
 const legal=new LegalService(db);
 app.get('/api/v1/legal',async()=>({demo:true,commercialSalesEnabled:false,documents:legal.catalog()}));
 app.get<{Params:{id:string}}>('/api/v1/legal/:id',async req=>legal.document(req.params.id));
 app.get('/api/v1/admin/integrations',async req=>{await auth.user(req,true);const unknown=await db.providerAttempt.count({where:{status:'UNKNOWN'}});return {...INTEGRATION_READINESS,unknownOperations:unknown};});
}
