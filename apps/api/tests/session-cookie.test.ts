import {describe,it,expect} from 'vitest';
import {sessionCookieName,loginCookieName,cookieHeader,appendCookie} from '../src/session-cookie.js';
import {Auth} from '../src/auth.js';
import type {FastifyReply,FastifyRequest} from 'fastify';
describe('embedded session cookies',()=>{
 it('keeps production tokens host-only, HttpOnly and partitioned',()=>{const value=cookieHeader(sessionCookieName(true),'A'.repeat(43),600,true);for(const flag of ['Path=/','HttpOnly','SameSite=None','Secure','Partitioned'])expect(value).toContain(flag);expect(value).not.toContain('Domain=');expect(sessionCookieName(true)).toBe('__Host-sharedvps-v2');expect(loginCookieName(true)).toBe('__Host-sharedvps-login-v2');});
 it('retains local non-secure test cookies',()=>{expect(cookieHeader(sessionCookieName(false),'value',600,false)).toBe('sharedvps=value; Path=/; HttpOnly; SameSite=Lax; Max-Age=600');});
 it('appends instead of discarding other cookie clears',()=>{let current:unknown='proof=; Max-Age=0';const reply={getHeader:()=>current,header:(_key:string,v:unknown)=>{current=v}} as unknown as FastifyReply;appendCookie(reply,'session=; Max-Age=0');expect(current).toEqual(['proof=; Max-Age=0','session=; Max-Age=0']);});
 it('accepts an existing browser session, prefers v2 and does not fall back from malformed v2',()=>{const auth=new Auth({} as never,{NODE_ENV:'production'} as never,{} as never);const req=(cookie:string)=>({headers:{cookie}} as FastifyRequest);const a='A'.repeat(43),b='B'.repeat(43);expect(auth.token(req('__Host-sharedvps='+a))).toBe(a);expect(auth.token(req('__Host-sharedvps='+a+'; __Host-sharedvps-v2='+b))).toBe(b);expect(auth.token(req('__Host-sharedvps='+a+'; __Host-sharedvps-v2=bad'))).toBe('');expect(auth.tokens(req('__Host-sharedvps='+a+'; __Host-sharedvps-v2='+b))).toEqual([b,a]);});
});
