import { createHash } from 'node:crypto';
import type { PrismaClient } from '@shared-vps/database';
import { LEGAL_DOCUMENTS, approvedLegal, publicLegal, type LegalDocument } from '@shared-vps/shared';
import { locked,fail } from './engine.js';
import type { Channel } from './integration-adapters.js';
export const PURCHASE_DOCUMENTS=['offer','agreement','payments'] as const;
export class LegalService {
 constructor(private db:PrismaClient,private documents:readonly LegalDocument[]=LEGAL_DOCUMENTS,private now=()=>Date.now()){}
 catalog(){return publicLegal(this.documents,this.now());}
 document(id:string){const d=this.documents.find(d=>d.id===id);if(!d||!approvedLegal(d,this.now()))fail(404,'LEGAL_DOCUMENT_NOT_PUBLISHED');return {...this.catalog().find(p=>p.id===id),body:d.body};}
 private current(){return PURCHASE_DOCUMENTS.map(id=>{const d=this.documents.find(d=>d.id===id);if(!d||!approvedLegal(d,this.now())||createHash('sha256').update(d.body!).digest('hex')!==d.digest)fail(409,'LEGAL_DOCUMENTS_NOT_APPROVED');return d;});}
 async accept(userId:string,orderId:string,channel:Channel,versions:{id:string;version:string;digest:string}[]){
  const docs=this.current();if(versions.length!==docs.length||docs.some(d=>versions.filter(v=>v.id===d.id&&v.version===d.version&&v.digest===d.digest).length!==1))fail(409,'LEGAL_VERSION_CHANGED');
  return locked(this.db,async tx=>{
   const order=await tx.order.findFirst({where:{id:orderId,userId}});if(!order)fail(404,'ORDER_NOT_FOUND');if(order.status!=='AWAITING_PAYMENT')fail(409,'ORDER_ALREADY_STARTED');
   for(const d of docs){const prior=await tx.legalAcceptance.findUnique({where:{orderId_documentId:{orderId,documentId:d.id}}});if(prior){if(prior.version!==d.version||prior.digest!==d.digest||prior.channel!==channel)fail(409,'LEGAL_VERSION_CHANGED');continue;}await tx.legalAcceptance.create({data:{userId,orderId,channel,documentId:d.id,version:d.version,digest:d.digest!}});}
   return {accepted:true};
  });
 }
 async requireAccepted(userId:string,orderId:string,channel:Channel){
  const docs=this.current(),rows=await this.db.legalAcceptance.findMany({where:{userId,orderId,channel}});
  if(docs.some(d=>!rows.some(r=>r.documentId===d.id&&r.version===d.version&&r.digest===d.digest)))fail(409,'LEGAL_ACCEPTANCE_REQUIRED');
 }
}
