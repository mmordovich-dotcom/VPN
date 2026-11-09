import { createHmac, timingSafeEqual } from 'node:crypto';
export type SandboxVendor = 'STARS_SANDBOX'|'ROLLYPAY_SANDBOX'|'CLOUDPAYMENTS_SANDBOX';
export type TestProvider = 'STARS_TEST' | 'SBP_MOCK' | 'EXTERNAL_TEST';
export type PaymentState = 'PENDING' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export interface PaymentObservation { operationId: string; eventId: string; externalId: string; amount: number; currency: 'RUB' | 'XTR'; state: PaymentState; mode: 'SANDBOX'; provider: TestProvider|SandboxVendor }
/** Internal normalized contract, not an assertion about a vendor HTTP API. */
export interface PaymentProvider { readonly mode: 'SANDBOX' | 'LIVE'; readonly name: string; verify(raw: string, authentication: string): Promise<PaymentObservation>; observe(operationKey: string): Promise<PaymentObservation | null> }
export interface ExternalPaymentProvider extends PaymentProvider { readonly contractVerified: boolean }
export interface RollyPayAdapterContract extends ExternalPaymentProvider { readonly name: 'ROLLYPAY'; readonly contractVerified: boolean }
export interface CloudPaymentsAdapterContract extends ExternalPaymentProvider { readonly name: 'CLOUDPAYMENTS'; readonly contractVerified: false }
export interface YooKassaAdapterContract extends ExternalPaymentProvider { readonly name: 'YOOKASSA'; readonly contractVerified: false }
/** Only server-side adapters may call this after signature AND source validation. */
export function verifiedSandboxObservation(value:PaymentObservation):PaymentObservation {
 if(!['STARS_SANDBOX','ROLLYPAY_SANDBOX','CLOUDPAYMENTS_SANDBOX'].includes(value.provider)||value.mode!=='SANDBOX'||!Number.isSafeInteger(value.amount)||value.amount<=0)throw new Error('UNVERIFIED_PAYMENT_EVENT');
 const result=Object.freeze({...value});trusted.add(result);return result;
}
const states = ['PENDING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED','REFUNDED'];
const trusted = new WeakSet<object>();
export function assertTestObservation(value: PaymentObservation) { if (!trusted.has(value)) throw new Error('UNVERIFIED_PAYMENT_EVENT'); }
/** Offline fixture authentication only. Never register this secret on a real provider. */
export class TestPaymentProvider implements PaymentProvider {
  readonly mode = 'SANDBOX' as const;
  constructor(readonly name: TestProvider, private secret: string) {
    if (!['STARS_TEST','SBP_MOCK','EXTERNAL_TEST'].includes(name) || !secret.startsWith('test-only:') || secret.length < 32) throw new Error('TEST_PROVIDER_ONLY');
  }
  signFixture(raw: string) { return createHmac('sha256',this.secret).update(raw).digest('hex'); }
  async verify(raw: string, authentication: string): Promise<PaymentObservation> {
    if(Buffer.byteLength(raw)>8192 || !/^[a-f0-9]{64}$/.test(authentication) || !timingSafeEqual(Buffer.from(authentication,'hex'),Buffer.from(this.signFixture(raw),'hex'))) throw new Error('UNTRUSTED_TEST_EVENT');
    const input: unknown = JSON.parse(raw);
    if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('INVALID_TEST_EVENT');
    const p=input as Record<string,unknown>;
    // Stars fixture mirrors successful_payment fields, but never consumes the live bot webhook.
    const s=this.name==='STARS_TEST' && p.successful_payment && typeof p.successful_payment==='object' ? p.successful_payment as Record<string,unknown> : null;
    const value = { operationId: s?.invoice_payload ?? p.operationId, eventId:p.eventId, externalId:s?.telegram_payment_charge_id ?? p.externalId, amount:s?.total_amount ?? p.amount, currency:s?.currency ?? p.currency, state:s?'SUCCEEDED':p.state, mode:p.mode, provider:p.provider };
    if(value.mode!=='SANDBOX' || value.provider!==this.name || typeof value.operationId!=='string' || !/^[a-f0-9-]{36}$/.test(value.operationId) || typeof value.eventId!=='string' || !/^[A-Za-z0-9:_-]{1,180}$/.test(value.eventId) || typeof value.externalId!=='string' || !/^test:[A-Za-z0-9:_-]{1,175}$/.test(value.externalId) || !Number.isSafeInteger(value.amount) || Number(value.amount)<=0 || !states.includes(String(value.state)) || value.currency!==(this.name==='STARS_TEST'?'XTR':'RUB')) throw new Error('INVALID_TEST_EVENT');
    const result=Object.freeze(value) as PaymentObservation; trusted.add(result); return result;
  }
  async observe(_operationKey: string): Promise<PaymentObservation | null> { return null; }
}
export class MockSbpProvider extends TestPaymentProvider { constructor(secret:string){super('SBP_MOCK',secret);} }
export class TestTelegramStarsProvider extends TestPaymentProvider { constructor(secret:string){super('STARS_TEST',secret);} }
/** No vendor URLs, methods, accounts or credentials are invented or enabled. */
export function unavailableLiveProvider(): never { throw new Error('LIVE_PAYMENTS_DISABLED'); }
