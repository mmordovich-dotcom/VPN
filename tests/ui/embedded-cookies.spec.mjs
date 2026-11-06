import {test,expect} from '@playwright/test';
test.use({launchOptions:{ignoreDefaultArgs:['--disable-features=AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument']}});

// Cross-site embedding uses the real production cookie builder and Chromium's cookie store.
async function embedCookieProbe(page,cookie){
 await page.route('https://**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='app.axon-cookie.test'){await route.fulfill({contentType:'text/html',body:'<iframe title="Mini App cookie probe" src="https://app.axon-cookie.test/?mode='+url.searchParams.get('mode')+'"></iframe>'});return;}
  if(url.pathname==='/set'){await route.fulfill({headers:{'set-cookie':cookie},contentType:'application/json',body:'{}'});return;}
  if(url.pathname==='/check'){await route.fulfill({contentType:'application/json',body:JSON.stringify({received:Boolean((await route.request().allHeaders()).cookie?.includes(cookie.split('=')[0]+'='))})});return;}
  await route.fulfill({contentType:'text/html',body:'<p id="result">Loading</p><script>(async()=>{const before=await(await fetch("/check")).json();if(new URLSearchParams(location.search).get("mode")!=="read")await fetch("/set",{method:"POST"});const after=await(await fetch("/check")).json();document.querySelector("#result").textContent=JSON.stringify({before:before.received,after:after.received,visible:document.cookie.includes("sharedvps")});})()</script>'});
 });
 return async(host,mode='set')=>{await page.goto('https://'+host+'-shell.test/?mode='+mode);const result=page.frameLocator('iframe').locator('#result');await expect(result).not.toHaveText('Loading');return JSON.parse(await result.textContent());};
}
// Playwright 1.56.1 disables ThirdPartyStoragePartitioning in a combined default flag.
// Only these cookie-policy tests restore Chromium defaults; the existing UI tests are unchanged.
// Source: microsoft/playwright v1.56.1 chromiumSwitches.ts. Update with the pinned tooling version.
test.describe('Chromium default cookie partitioning',()=>{
test('Telegram Web reproduces Lax loss while production partitioned cookies survive and stay HttpOnly',async({page})=>{
 const {cookieHeader,sessionCookieName}=await import('../../apps/api/src/session-cookie.ts');
 let probe=await embedCookieProbe(page,'__Host-legacy-probe='+ 'A'.repeat(43)+'; Path=/; Secure; HttpOnly; SameSite=Lax');
 expect((await probe('telegram')).after).toBe(false);
 await page.unroute('https://**/*');
 probe=await embedCookieProbe(page,cookieHeader(sessionCookieName(true),'B'.repeat(43),600,true));
 expect(await probe('telegram')).toEqual({before:false,after:true,visible:false});
 expect((await page.context().cookies()).find(c=>c.name===sessionCookieName(true))).toMatchObject({httpOnly:true,secure:true,sameSite:'None',partitionKey:'https://telegram-shell.test'});
 expect(await probe('unrelated','read')).toEqual({before:false,after:false,visible:false});
 expect(await probe('telegram','read')).toEqual({before:true,after:true,visible:false});
});
test('Telegram Web browser-proof cookie stays bound to its embedded top-level site',async({page})=>{
 const {cookieHeader,loginCookieName}=await import('../../apps/api/src/session-cookie.ts');
 const probe=await embedCookieProbe(page,cookieHeader(loginCookieName(true),'C'.repeat(43),600,true));
 expect(await probe('telegram')).toEqual({before:false,after:true,visible:false});
 expect((await page.context().cookies()).find(c=>c.name===loginCookieName(true))).toMatchObject({httpOnly:true,secure:true,sameSite:'None',partitionKey:'https://telegram-shell.test'});
 expect(await probe('unrelated','read')).toEqual({before:false,after:false,visible:false});
});

});
