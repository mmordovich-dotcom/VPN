import type { FastifyReply } from 'fastify';
/** Production cookies work in cross-site Mini App frames without JS-readable credentials. */
export const sessionCookieName=(production:boolean)=>production?'__Host-sharedvps-v2':'sharedvps';
export const legacySessionCookieName=(production:boolean)=>production?'__Host-sharedvps':'sharedvps';
export const loginCookieName=(production:boolean)=>production?'__Host-sharedvps-login-v2':'sharedvps-login';
export function cookieHeader(name:string,value:string,maxAge:number,production:boolean){return name+'='+value+'; Path=/; HttpOnly; SameSite='+(production?'None':'Lax')+'; Max-Age='+maxAge+(production?'; Secure; Partitioned':'');}
// Fastify appends Set-Cookie values itself; passing prior values duplicates them.
export function appendCookie(reply:FastifyReply,value:string){reply.header('set-cookie',value);}
