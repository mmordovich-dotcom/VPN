import {describe,it,expect} from 'vitest';
import {backoff,JobFailure} from '../src/job-queue.js';
import {pageSpec} from '../src/pagination.js';
import {telegramFailure} from '../src/telegram-errors.js';
import {errorCategory} from '../src/plugins/errors.js';
describe('Stage 1.3 reliability policies',()=>{
  it('uses exponential delay with an upper bound',()=>{expect([1,2,3].map(x=>backoff(x))).toEqual([1000,2000,4000]);expect(backoff(99)).toBeLessThanOrEqual(3600000);});
  it('honours bounded Telegram retry_after',()=>{expect(backoff(1,120000)).toBe(120000);expect(telegramFailure(429,9000).retryAfterMs).toBe(3600000);});
  it('separates blocked, permanent and temporary errors',()=>{expect(telegramFailure(403).permanent).toBe(true);expect(telegramFailure(400).permanent).toBe(true);expect(telegramFailure(503).permanent).toBe(false);expect(new JobFailure('DELIVERY_UNKNOWN',false,0,true).ambiguous).toBe(true);});
  it('bounds page size',()=>{expect(pageSpec('orders',{}).limit).toBe(20);for(const limit of [0,51,1.5])expect(()=>pageSpec('orders',{limit})).toThrow();});
  it('rejects unknown filters and sort orders',()=>{expect(()=>pageSpec('users',{status:'ADMIN'})).toThrow();expect(()=>pageSpec('orders',{sort:'sql' as 'newest'})).toThrow();});
  it('does not accept malformed cursor data',()=>{for(const cursor of ['not-json',Buffer.from('{}').toString('base64url')])expect(()=>pageSpec('users',{cursor})).toThrow();});
  it('binds cursors to resource, filters and user scope',()=>{const p=pageSpec('orders',{status:'PAID'},'user-a');const cursor=Buffer.from(JSON.stringify({f:p.fingerprint,id:'11111111-1111-4111-8111-111111111111',at:new Date().toISOString()})).toString('base64url');expect(pageSpec('orders',{status:'PAID',cursor},'user-a').after).toBeDefined();for(const scope of ['admin','user-b'])expect(()=>pageSpec('orders',{status:'PAID',cursor},scope)).toThrow();expect(()=>pageSpec('orders',{cursor},'user-a')).toThrow();});
  it('separates ordinary rejections from system errors',()=>{expect(errorCategory(401)).toBe('authorization');expect(errorCategory(429)).toBe('rate-limit');expect(errorCategory(409)).toBe('conflict');expect(errorCategory(503)).toBe('system');});
});
