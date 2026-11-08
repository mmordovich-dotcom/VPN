import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MockSbpProvider, TestTelegramStarsProvider, TestPaymentProvider, assertTestObservation, unavailableLiveProvider } from '../src/payment-provider.js';
const secret='test-only:'+ 'x'.repeat(40);
const body=(overrides={})=>JSON.stringify({operationId:randomUUID(),eventId:'evt:1',externalId:'test:charge:1',amount:17000,currency:'RUB',state:'SUCCEEDED',mode:'SANDBOX',provider:'SBP_MOCK',...overrides});
describe('Stage 1.9 offline payment trust boundary',()=>{
 it('accepts only an authenticated sandbox observation',async()=>{const p=new MockSbpProvider(secret);const raw=body();const value=await p.verify(raw,p.signFixture(raw));expect(()=>assertTestObservation(value)).not.toThrow();expect(value.amount).toBe(17000);});
 it('rejects an unsigned or tampered fixture',async()=>{const p=new MockSbpProvider(secret);const raw=body();await expect(p.verify(raw,'bad')).rejects.toThrow('UNTRUSTED_TEST_EVENT');await expect(p.verify(raw.replace('17000','18000'),p.signFixture(raw))).rejects.toThrow('UNTRUSTED_TEST_EVENT');});
 it('rejects forged normalized observations',()=>{expect(()=>assertTestObservation(JSON.parse(body()))).toThrow('UNVERIFIED_PAYMENT_EVENT');});
 it.each([{mode:'LIVE'},{mode:'DEMO'},{currency:'XTR'},{amount:-1},{amount:1.5},{state:'REDIRECT_SUCCESS'},{externalId:'real-charge'},{provider:'ROLLYPAY'}])('rejects invalid or non-sandbox input %j',async overrides=>{const p=new MockSbpProvider(secret);const raw=body(overrides);await expect(p.verify(raw,p.signFixture(raw))).rejects.toThrow('INVALID_TEST_EVENT');});
 it('maps a Stars successful_payment fixture using XTR and charge ID',async()=>{const p=new TestTelegramStarsProvider(secret);const id=randomUUID();const raw=JSON.stringify({eventId:'stars:update:1',provider:'STARS_TEST',mode:'SANDBOX',successful_payment:{invoice_payload:id,telegram_payment_charge_id:'test:stars:1',total_amount:50,currency:'XTR'}});expect(await p.verify(raw,p.signFixture(raw))).toMatchObject({operationId:id,state:'SUCCEEDED',externalId:'test:stars:1',currency:'XTR',amount:50});});
 it('does not turn pre_checkout into a captured Stars payment',async()=>{const p=new TestTelegramStarsProvider(secret);const raw=JSON.stringify({pre_checkout_query:{id:'1'},provider:'STARS_TEST',mode:'SANDBOX'});await expect(p.verify(raw,p.signFixture(raw))).rejects.toThrow('INVALID_TEST_EVENT');});
 it('requires explicit test-only configuration and disables live factories',()=>{expect(()=>new MockSbpProvider('real-secret')).toThrow('TEST_PROVIDER_ONLY');expect(()=>new TestPaymentProvider('ROLLYPAY' as 'SBP_MOCK',secret)).toThrow('TEST_PROVIDER_ONLY');expect(()=>unavailableLiveProvider()).toThrow('LIVE_PAYMENTS_DISABLED');});
});
