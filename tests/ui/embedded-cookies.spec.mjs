import {test,expect} from '@playwright/test';
import {createServer} from 'node:https';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

// Pinned Playwright 1.56.1 disables ThirdPartyStoragePartitioning by default.
// These two tests restore Chromium defaults; the original 24 UI tests are unchanged.
test.use({ignoreHTTPSErrors:true,launchOptions:{
 ignoreDefaultArgs:['--disable-features=AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument'],
 args:['--host-resolver-rules=MAP app.axon-cookie.test 127.0.0.1,MAP telegram-shell.test 127.0.0.1,MAP unrelated-shell.test 127.0.0.1'],
}});
let certificateDir,key,cert;
test.beforeAll(async()=>{
 certificateDir=await mkdtemp(join(tmpdir(),'axon-cookie-fixture-'));
 // Disposable CI-only certificate, never an application credential or a production TLS change.
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(certificateDir,'key.pem'),'-out',join(certificateDir,'cert.pem'),'-days','1','-subj','/CN=app.axon-cookie.test','-addext','subjectAltName=DNS:app.axon-cookie.test,DNS:telegram-shell.test,DNS:unrelated-shell.test'],{stdio:'pipe'});
 key=await readFile(join(certificateDir,'key.pem'));cert=await readFile(join(certificateDir,'cert.pem'));
});
test.afterAll(async()=>{if(certificateDir){await Promise.all(['key.pem','cert.pem'].map(name=>unlink(join(certificateDir,name)).catch(()=>{})));await rmdir(certificateDir);}});

async function embeddedProbe(page,cookie,run){
 const cdp=await page.context().newCDPSession(page);
 const command=await cdp.send('Browser.getBrowserCommandLine');
 expect(command.arguments.filter(arg=>arg.startsWith('--disable-features=')).some(arg=>arg.includes('ThirdPartyStoragePartitioning'))).toBe(false);
 await cdp.detach();
 let port;
 const server=createServer({key,cert},(req,res)=>{
  const url=new URL(req.url,'https://'+req.headers.host);res.setHeader('cache-control','no-store');
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url.hostname!=='app.axon-cookie.test'){res.setHeader('content-type','text/html');res.end('<iframe title="Mini App cookie probe" src="https://app.axon-cookie.test:'+port+'/?mode='+url.searchParams.get('mode')+'"></iframe>');return;}
  if(url.pathname==='/set'){res.setHeader('set-cookie',cookie);res.setHeader('content-type','application/json');res.end('{}');return;}
  if(url.pathname==='/check'){res.setHeader('content-type','application/json');res.end(JSON.stringify({received:Boolean(req.headers.cookie?.includes(cookie.split('=')[0]+'='))}));return;}
  res.setHeader('content-type','text/html');res.end('<p id="result">Loading</p><script>(async()=>{const before=await(await fetch("/check")).json();if(new URLSearchParams(location.search).get("mode")!=="read")await fetch("/set",{method:"POST"});const after=await(await fetch("/check")).json();document.querySelector("#result").textContent=JSON.stringify({before:before.received,after:after.received,visible:document.cookie.includes("sharedvps")});})()</script>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});port=server.address().port;
 const probe=async(host,mode='set')=>{await page.goto('https://'+host+'-shell.test:'+port+'/?mode='+mode);const result=page.frameLocator('iframe').locator('#result');await expect(result).not.toHaveText('Loading');return JSON.parse(await result.textContent());};
 try{await run(probe);}finally{await page.goto('about:blank');server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('Telegram Web reproduces Lax loss while production partitioned cookies survive and stay HttpOnly',async({page})=>{
 const {cookieHeader,sessionCookieName}=await import('../../apps/api/src/session-cookie.ts');
 await embeddedProbe(page,'__Host-legacy-probe='+ 'A'.repeat(43)+'; Path=/; Secure; HttpOnly; SameSite=Lax',async probe=>{expect((await probe('telegram')).after).toBe(false);});
 await embeddedProbe(page,cookieHeader(sessionCookieName(true),'B'.repeat(43),600,true),async probe=>{
  expect(await probe('telegram')).toEqual({before:false,after:true,visible:false});
  expect((await page.context().cookies()).find(c=>c.name===sessionCookieName(true))).toMatchObject({httpOnly:true,secure:true,sameSite:'None',partitionKey:'https://telegram-shell.test'});
  expect(await probe('unrelated','read')).toEqual({before:false,after:false,visible:false});
  expect(await probe('telegram','read')).toEqual({before:true,after:true,visible:false});
 });
});
test('Telegram Web browser-proof cookie stays bound to its embedded top-level site',async({page})=>{
 const {cookieHeader,loginCookieName}=await import('../../apps/api/src/session-cookie.ts');
 await embeddedProbe(page,cookieHeader(loginCookieName(true),'C'.repeat(43),600,true),async probe=>{
  expect(await probe('telegram')).toEqual({before:false,after:true,visible:false});
  expect((await page.context().cookies()).find(c=>c.name===loginCookieName(true))).toMatchObject({httpOnly:true,secure:true,sameSite:'None',partitionKey:'https://telegram-shell.test'});
  expect(await probe('unrelated','read')).toEqual({before:false,after:false,visible:false});
 });
});
