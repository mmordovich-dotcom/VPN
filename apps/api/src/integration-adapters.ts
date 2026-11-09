import { createHmac, timingSafeEqual, randomUUID, createHash } from 'node:crypto';
import type { PaymentState } from './payment-provider.js';
export type Vendor = 'STARS_SANDBOX'|'ROLLYPAY_SANDBOX'|'CLOUDPAYMENTS_SANDBOX';
export type Channel = 'TELEGRAM'|'WEBSITE';
export type Context = { id:string; orderId:string; amount:number; currency:'RUB'|'XTR'; externalId:string; state?:PaymentState|undefined; telegramId?:string|undefined };
export type Evidence = { externalId:string; state:PaymentState; amount:number; currency:'RUB'|'XTR'; eventId:string };
export type Checkout = { externalId:string; url:string };
export type Headers = Record<string,string|undefined>;
export type Http = (url:string,init:RequestInit)=>Promise<Response>;
export interface SandboxAdapter {
 readonly name:Vendor; readonly currency:'XTR'|'RUB';
 create(c:Context,key:string):Promise<Checkout>;
 observe(c:Context):Promise<Evidence|null>;
 refund(c:Context,key:string):Promise<void>;
 verify(raw:string,headers:Headers,c:Context):Promise<Evidence>;
}
export function requireChannel(v:Vendor,channel:Channel) { if(v==='STARS_SANDBOX'?channel!=='TELEGRAM':channel!=='WEBSITE')throw new Error('PAYMENT_CHANNEL_FORBIDDEN'); }
export function minor(value:unknown):number {
 const v=String(value); if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(v))throw new Error('INVALID_MONEY');
 const [whole,part='']=v.split('.');const result=Number(whole)*100+Number(part.padEnd(2,'0'));
 if(!Number.isSafeInteger(result)||result<=0)throw new Error('INVALID_MONEY');return result;
}
function json(raw:string):Record<string,unknown>{ if(Buffer.byteLength(raw)>32768)throw new Error('PROVIDER_BODY_LIMIT'); const p:unknown=JSON.parse(raw);if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('PROVIDER_RESPONSE_INVALID');return p as Record<string,unknown>; }
function str(v:unknown){if(typeof v!=='string'||!v||v.length>180)throw new Error('PROVIDER_RESPONSE_INVALID');return v;}
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function url(value:unknown,host:string,pathPrefix:string){const u=new URL(String(value));if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password||!u.pathname.startsWith(pathPrefix))throw new Error('UNSAFE_CHECKOUT_URL');return u.toString();}
function evidence(p:Record<string,unknown>,c:Context,state:PaymentState,externalId:string,eventId:string,currency:'RUB'|'XTR',amount:number):Evidence {
 if(p.order_id!==c.orderId||currency!==c.currency||amount!==c.amount||(!c.externalId.startsWith('pending:')&&externalId!==c.externalId))throw new Error('PAYMENT_SOURCE_MISMATCH');
 return {externalId:str(externalId),state,amount,currency,eventId};
}
const wire:Http=(u,i)=>fetch(u,{...i,redirect:'error',signal:AbortSignal.timeout(8000)});
async function request(http:Http,u:string,body:unknown,headers:Record<string,string>,method='POST'){
 // Never retry a mutation here. The durable caller owns UNKNOWN/reconciliation.
 let r:Response;try{r=await http(u,{method,headers:{'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});}catch{throw new Error('PROVIDER_OUTCOME_UNKNOWN');}
 if(!r.ok)throw new Error('PROVIDER_OUTCOME_UNKNOWN');const text=await r.text();return json(text);
}
/** Official RollyPay API, sandbox only; never reads a LIVE result into the ledger. */
export class RollyPaySandbox implements SandboxAdapter {
 readonly name='ROLLYPAY_SANDBOX' as const;readonly currency='RUB' as const;
 constructor(private key:string,private signingSecret:string,private http:Http=wire,private now=()=>Date.now()) {if(!key||signingSecret.length<32)throw new Error('PROVIDER_CREDENTIALS_REQUIRED');}
 private async api(endpoint:string,body:unknown,method='POST'){return request(this.http,'https://rollypay.io/api/v1'+endpoint,body,{'X-API-Key':this.key,'X-Nonce':randomUUID(),'X-Test-Mode':'true'},method);}
 private normalize(p:Record<string,unknown>,c:Context,eventId:string){
  if(p.test!==true||(p.environment!==undefined&&p.environment!=='sandbox'))throw new Error('PAYMENT_ENVIRONMENT_MISMATCH');
  const states:Record<string,PaymentState>={created:'PENDING',processing:'PENDING',paid:'SUCCEEDED',expired:'CANCELLED',canceled:'CANCELLED',refunded:'REFUNDED',chargeback:'REFUNDED'};
  const state=states[String(p.status)];if(!state||String(p.currency??p.payment_currency)!=='RUB')throw new Error('PROVIDER_RESPONSE_INVALID');
  return evidence(p,c,state,str(p.payment_id),eventId,'RUB',minor(p.amount));
 }
 async create(c:Context,_key:string){
  const p=await this.api('/payments',{amount:(c.amount/100).toFixed(2),payment_currency:'RUB',payment_method:'sbp',order_id:c.orderId,description:'AXON sandbox · 30 days',test:true});
  this.normalize(p,c,'create');return {externalId:str(p.payment_id),url:url(p.pay_url,'pay.rollypay.io','/pay/')};
 }
 async observe(c:Context){if(c.externalId.startsWith('pending:'))return null;const p=await this.api('/payments/'+encodeURIComponent(c.externalId),null,'GET');return this.normalize(p,c,'poll:'+createHash('sha256').update(JSON.stringify(p)).digest('hex'));}
 async verify(raw:string,h:Headers,c:Context):Promise<Evidence>{
  const t=h['x-timestamp']??'',sig=h['x-signature']??'';
  if(!/^\d{10}$/.test(t)||Math.abs(this.now()/1000-Number(t))>300||!equal(sig,createHmac('sha256',this.signingSecret).update(t+'.'+raw).digest('hex')))throw new Error('UNTRUSTED_PROVIDER_EVENT');
  const p=json(raw);if(h['x-test-mode']!=='true')throw new Error('PAYMENT_ENVIRONMENT_MISMATCH');
  const event=String(p.event_type);if(event!=='payment.'+String(p.status)&&!(event==='refund_request.completed'&&p.status==='refunded'))throw new Error('PROVIDER_RESPONSE_INVALID');
  // Stable semantic identity: the timestamp is delivery time, not a state sequence number.
  return this.normalize(p,c,'rolly:'+String(p.status)+':'+createHash('sha256').update(raw).digest('hex'));
 }
 async refund(_c:Context,_key:string):Promise<void>{throw new Error('ROLLYPAY_SANDBOX_REFUNDS_UNSUPPORTED');}
}
/** Reserve candidate. Dedicated test terminal required. No card data or recurring debits. */
export class CloudPaymentsSandbox implements SandboxAdapter {
 readonly name='CLOUDPAYMENTS_SANDBOX' as const;readonly currency='RUB' as const;
 constructor(private publicId:string,private secret:string,private http:Http=wire){if(!publicId.startsWith('test_api_')||secret.length<16)throw new Error('CLOUDPAYMENTS_TEST_TERMINAL_REQUIRED');}
 private api(endpoint:string,body:unknown,key:string=randomUUID()){return request(this.http,'https://api.cloudpayments.ru'+endpoint,body,{Authorization:'Basic '+Buffer.from(this.publicId+':'+this.secret).toString('base64'),'X-Request-ID':key});}
 async create(c:Context,key:string){const p=await this.api('/orders/create',{Amount:c.amount/100,Currency:'RUB',Description:'AXON sandbox · 30 days',InvoiceId:c.orderId,RequireConfirmation:false,SendEmail:false,SendSms:false},key);if(p.Success!==true||!p.Model||typeof p.Model!=='object')throw new Error('PROVIDER_RESPONSE_INVALID');const m=p.Model as Record<string,unknown>;if(minor(m.Amount)!==c.amount||m.Currency!=='RUB')throw new Error('PAYMENT_SOURCE_MISMATCH');return {externalId:'invoice:'+str(m.Id),url:url(m.Url,'orders.cloudpayments.ru','/d/')};}
 async observe(c:Context):Promise<Evidence|null>{
  const p=await this.api('/v2/payments/find',{InvoiceId:c.orderId});if(p.Success===false)return null;
  if(p.Success!==true||!p.Model||typeof p.Model!=='object')throw new Error('PROVIDER_RESPONSE_INVALID');const m=p.Model as Record<string,unknown>;
  if(m.TestMode!==true||m.InvoiceId!==c.orderId||m.Currency!=='RUB'||minor(m.Amount)!==c.amount)throw new Error('PAYMENT_SOURCE_MISMATCH');
  // find may return a refund or only the latest attempt; never interpret that as a capture.
  if(m.Type!==0||m.Refunded===true||m.Status!=='Completed')return null;
  return {externalId:str(String(m.TransactionId)),state:'SUCCEEDED',amount:c.amount,currency:'RUB',eventId:'cp:pay:'+String(m.TransactionId)};
 }
 async verify(raw:string,h:Headers,c:Context){
  if(!equal(h['content-hmac']??'',createHmac('sha256',this.secret).update(raw).digest('base64')))throw new Error('UNTRUSTED_PROVIDER_EVENT');
  const p:Record<string,unknown>=Object.fromEntries(new URLSearchParams(raw));
  // Refund notifications omit TestMode/Currency; authenticate then read the ORIGINAL transaction.
  const refund=h['axon-event']==='refund';
  if(refund){
   if(String(p.PaymentTransactionId)!==c.externalId||p.OperationType!=='Refund'||minor(p.Amount)!==c.amount)throw new Error('PAYMENT_SOURCE_MISMATCH');
   const original=await this.api('/payments/get',{TransactionId:Number(c.externalId)});const m=original.Model as Record<string,unknown>|undefined;
   if(original.Success!==true||!m||m.TestMode!==true||m.InvoiceId!==c.orderId||m.Currency!=='RUB'||minor(m.Amount)!==c.amount)throw new Error('PAYMENT_ENVIRONMENT_MISMATCH');
  }else if((p.TestMode!=='1'&&p.TestMode!=='true')||p.InvoiceId!==c.orderId||p.Currency!=='RUB'||minor(p.Amount)!==c.amount)throw new Error('PAYMENT_SOURCE_MISMATCH');
  // The endpoint kind is server-owned; never trust a body-supplied event type.
  const kind=h['axon-event'];if(kind!=='pay'&&kind!=='refund'&&kind!=='fail')throw new Error('PROVIDER_RESPONSE_INVALID');
  if(kind==='pay'&&p.Status!=='Completed')throw new Error('PROVIDER_RESPONSE_INVALID');
  const id=String(kind==='refund'?p.PaymentTransactionId:p.TransactionId);str(id);
  if(!/^\d+$/.test(id))throw new Error('PROVIDER_RESPONSE_INVALID');
  return {externalId:id,state:kind==='pay'?'SUCCEEDED':kind==='refund'?'REFUNDED':'FAILED',amount:c.amount,currency:'RUB',eventId:'cp:'+kind+':'+str(String(p.TransactionId))};
 }
 async refund(c:Context,key:string){if(!/^\d+$/.test(c.externalId))throw new Error('CAPTURE_REQUIRED');const p=await this.api('/payments/refund',{TransactionId:Number(c.externalId),Amount:c.amount/100},key);if(p.Success!==true)throw new Error('PROVIDER_OUTCOME_UNKNOWN');}
}
/** Dedicated Telegram TEST environment; this class cannot address the production Bot API. */
export class TelegramStarsSandbox implements SandboxAdapter {
 readonly name='STARS_SANDBOX' as const;readonly currency='XTR' as const;
 constructor(private token:string,private webhookSecret:string,private http:Http=wire){if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||webhookSecret.length<32)throw new Error('TELEGRAM_TEST_CREDENTIALS_REQUIRED');}
 private async api(method:string,body:unknown){const p=await request(this.http,'https://api.telegram.org/bot'+this.token+'/test/'+method,body,{});if(p.ok!==true)throw new Error('PROVIDER_OUTCOME_UNKNOWN');return p.result;}
 async create(c:Context,_key:string){if(c.currency!=='XTR'||!Number.isSafeInteger(c.amount)||c.amount<=0)throw new Error('INVALID_STARS_QUOTE');const result=await this.api('createInvoiceLink',{title:'AXON · TEST',description:'30 days · isolated sandbox, no VPN',payload:c.id,provider_token:'',currency:'XTR',prices:[{label:'AXON · TEST',amount:c.amount}]});return {externalId:c.externalId,url:url(result,'t.me','/$')};}
 async preCheckout(query:{id:string;from:{id:number};invoice_payload:string;currency:string;total_amount:number},c:Context,approved:boolean){
  const ok=approved&&query.invoice_payload===c.id&&String(query.from.id)===c.telegramId&&query.currency==='XTR'&&query.total_amount===c.amount;
  await this.api('answerPreCheckoutQuery',{pre_checkout_query_id:query.id,ok,...(!ok?{error_message:'TEST invoice unavailable. Start a new request.'}:{})});return ok;
 }
 authenticate(h:Headers){if(!equal(h['x-telegram-bot-api-secret-token']??'',this.webhookSecret))throw new Error('UNTRUSTED_PROVIDER_EVENT');}
 async verify(raw:string,h:Headers,c:Context){
  this.authenticate(h);
  const u=json(raw),m=u.message as Record<string,unknown>|undefined,p=m?.successful_payment as Record<string,unknown>|undefined,r=m?.refunded_payment as Record<string,unknown>|undefined;
  const value=p??r,from=m?.from as Record<string,unknown>|undefined,chat=m?.chat as Record<string,unknown>|undefined;
  if(!value||!Number.isSafeInteger(u.update_id)||String(from?.id)!==c.telegramId||String(chat?.id)!==c.telegramId||chat?.type!=='private'||value.invoice_payload!==c.id||value.currency!=='XTR'||value.total_amount!==c.amount)throw new Error('PAYMENT_SOURCE_MISMATCH');
  const charge=str(value.telegram_payment_charge_id);return {externalId:charge,state:p?'SUCCEEDED':'REFUNDED',amount:c.amount,currency:'XTR',eventId:'stars:'+(p?'paid:':'refund:')+charge};
 }
 async observe(c:Context):Promise<Evidence|null>{
  const found:Evidence[]=[];
  for(let offset=0;offset<500;offset+=100){
   const data=await this.transactions(offset) as {transactions?:unknown[]};if(!data||!Array.isArray(data.transactions))throw new Error('PROVIDER_RESPONSE_INVALID');
   for(const input of data.transactions){
    if(!input||typeof input!=='object')continue;const t=input as Record<string,unknown>;
    const partner=(t.source??t.receiver) as {type?:string;transaction_type?:string;user?:{id?:number};invoice_payload?:string}|undefined;
    if(partner?.type!=='user'||partner.transaction_type!=='invoice_payment'||String(partner.user?.id)!==c.telegramId||partner.invoice_payload!==c.id)continue;
    if(t.amount!==c.amount||(t.nanostar_amount!==undefined&&t.nanostar_amount!==0))throw new Error('PAYMENT_SOURCE_MISMATCH');
    const charge=str(t.id);if(!c.externalId.startsWith('pending:')&&charge!==c.externalId)throw new Error('MULTIPLE_PROVIDER_CAPTURES');
    const refund=Boolean(t.receiver);found.push({externalId:charge,state:refund?'REFUNDED':'SUCCEEDED',amount:c.amount,currency:'XTR',eventId:'stars:'+(refund?'refund:':'paid:')+charge});
   }
   if(data.transactions.length<100)break;
  }
  const captures=found.filter(e=>e.state==='SUCCEEDED');if(new Set(captures.map(e=>e.externalId)).size>1)throw new Error('MULTIPLE_PROVIDER_CAPTURES');
  return c.state==='SUCCEEDED'||c.state==='REFUNDED'?found.find(e=>e.state==='REFUNDED')??captures[0]??null:captures[0]??null;
 }
 async transactions(offset=0){return this.api('getStarTransactions',{offset,limit:100});}
 async refund(c:Context,_key:string){if(!c.telegramId||c.externalId.startsWith('pending:'))throw new Error('CAPTURE_REQUIRED');const r=await this.api('refundStarPayment',{user_id:Number(c.telegramId),telegram_payment_charge_id:c.externalId});if(r!==true)throw new Error('PROVIDER_OUTCOME_UNKNOWN');}
}
