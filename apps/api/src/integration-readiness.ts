/** No account-wide discovery or mutation is implemented until Aeza confirms a current contract. */
export const AEZA_BLOCKERS=Object.freeze(['CURRENT_API_CONTRACT','VPN_RESALE_PERMISSION','OWNER_PURCHASE_APPROVAL','ISOLATED_AXON_ACCOUNT_SCOPE'] as const);
export class AezaBlockedProvider {
 readonly name='AEZA';readonly enabled=false;
 async quote():Promise<never>{throw new Error('AEZA_CURRENT_CONTRACT_UNVERIFIED');}
 async create():Promise<never>{throw new Error('AEZA_PURCHASE_DISABLED');}
 async lookup():Promise<never>{throw new Error('AEZA_CURRENT_CONTRACT_UNVERIFIED');}
 async renew():Promise<never>{throw new Error('AEZA_PURCHASE_DISABLED');}
 async terminate():Promise<never>{throw new Error('AEZA_MUTATIONS_DISABLED');}
}
export type ResourceQuote={provider:'AEZA';productId:string;currency:'RUB';monthlyMinor:number;quotedAt:number;validUntil:number;capacity:3};
export function validateQuote(q:ResourceQuote,budgetMinor:number,committedMinor:number,now=Date.now()){
 if(q.provider!=='AEZA'||!q.productId||q.capacity!==3||q.currency!=='RUB'||![q.monthlyMinor,budgetMinor,committedMinor,q.quotedAt,q.validUntil].every(Number.isSafeInteger)||q.monthlyMinor<=0||committedMinor<0||q.quotedAt>now||q.validUntil<=now||q.validUntil<=q.quotedAt||q.validUntil-q.quotedAt>900000)throw new Error('RESOURCE_QUOTE_INVALID');
 if(committedMinor+q.monthlyMinor>budgetMinor)throw new Error('RESOURCE_BUDGET_EXCEEDED');
 return {monthlyMinor:q.monthlyMinor,capacity:3,fullyOccupiedRevenueMinor:17000*3,grossMarginMinor:51000-q.monthlyMinor};
}
export function ownedAxonResource(resource:{externalId:string;name:string;operationId:string|null;dedicated:boolean},allowedIds:readonly string[]){
 if(/SWE[ _-]?PROMO/i.test(resource.name+' '+resource.externalId)||!resource.dedicated||!resource.operationId||!allowedIds.includes(resource.externalId))throw new Error('RESOURCE_OUTSIDE_AXON_SCOPE');
 return resource.externalId;
}
/** Metadata plan only, not a claim that Aeza supplies a VPN control plane. */
export function independentAccessPlan(resourceId:string,clients:readonly {subscriptionId:string;accessId:string}[]){
 if(!resourceId||clients.length>3||new Set(clients.map(c=>c.subscriptionId)).size!==clients.length||new Set(clients.map(c=>c.accessId)).size!==clients.length||clients.some(c=>!c.subscriptionId||!c.accessId))throw new Error('INDEPENDENT_ACCESS_REQUIRED');
 return clients.map((c,index)=>({...c,resourceId,slot:index+1,revokeScope:'INDIVIDUAL' as const}));
}
export const INTEGRATION_READINESS={mode:'DEMO',livePayments:false,liveResources:false,providerSandboxVerified:false,aeza:{enabled:false,blockers:AEZA_BLOCKERS},required:['VERIFIED_SELLER','APPROVED_LEGAL_DOCUMENTS','PROVIDER_SANDBOX_PROOF','ALWAYS_ON_HOST','INDEPENDENT_BACKUP_RESTORE','EXPLICIT_LIVE_APPROVAL']};
