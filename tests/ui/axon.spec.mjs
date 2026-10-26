import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../apps/web/dist',import.meta.url));
let server;
test.beforeAll(async()=>{
  await mkdir('ui-results',{recursive:true});
  server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(404);res.end();return;}const file=path===root?resolve(root,'index.html'):path;const data=await readFile(file);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
const uid='11111111-1111-4111-8111-111111111111';
const plan={id:'22222222-2222-4222-8222-222222222222',name:'Basic',price:17000,currency:'RUB',durationDays:30,maxUsersPerServer:3,isActive:true};
function subscription(){return {id:'33333333-3333-4333-8333-333333333333',userId:uid,planId:plan.id,plan,status:'ACTIVE',startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString(),credentials:[{demoIdentifier:'demo:axon:fixture',revokedAt:null}],serverSlot:{server:{externalServerId:'demo:vps:fixture'}}};}
async function fixtures(page,options={}){
  let logged=options.logged!==false;let sub=options.empty?null:subscription();let preference={remindersEnabled:false,updatesEnabled:true};let mismatch=Boolean(options.mismatch);
  const role=options.admin?'ADMIN':'USER';const requests=[];const errors=[];const unexpected=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://telegram.org/js/telegram-web-app.js*',async route=>{
    if(options.sdkOffline){await route.abort();return;}
    const script=options.mini?`window.__tgEvents={};window.__tgCalls=[];window.Telegram={WebApp:{initData:'signed-fixture-only',colorScheme:'dark',viewportStableHeight:740,safeAreaInset:{top:20,bottom:12,left:0,right:0},contentSafeAreaInset:{top:40,bottom:4,left:0,right:0},ready(){window.__tgCalls.push('ready')},expand(){window.__tgCalls.push('expand')},onEvent(n,f){window.__tgEvents[n]=f},offEvent(n){delete window.__tgEvents[n]},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},BackButton:{show(){window.__tgBackVisible=true},hide(){window.__tgBackVisible=false},onClick(f){window.__tgBack=f},offClick(){}},SettingsButton:{show(){},hide(){},onClick(f){window.__tgSettings=f},offClick(){}},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};`:'window.Telegram={WebApp:{initData:""}};';
    await route.fulfill({contentType:'text/javascript',body:script});
  });
  await page.route('**/api/v1/**',async route=>{
    const request=route.request();const url=new URL(request.url());const path=url.pathname.slice('/api/v1'.length);const method=request.method();const body=method==='POST'?request.postDataJSON():undefined;
    requests.push({path,query:url.search,method,body,headers:request.headers()});
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(path==='/auth/config')return json({botUsername:'vpnaxon_bot',loginEnabled:true,loginMode:'bot',stage:'1.4',demo:true});
    if(path==='/me')return json(logged?{id:uid,role}:{error:'LOGIN_REQUIRED'},logged?200:401);
    if(path==='/plans')return json([plan]);
    if(path==='/auth/telegram'){
      if(mismatch&&logged)return json({error:'AUTH_LOGOUT_FIRST'},409);
      if(options.replay&&logged)return json({error:'LOGIN_REPLAY'},401);
      logged=true;return json({id:uid,role});
    }
    if(path==='/auth/logout'){logged=false;mismatch=false;return json({ok:true});}
    if(path==='/auth/bot/request')return json({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',displayCode:'123456',expiresAt:new Date(Date.now()+300000).toISOString(),deepLink:'https://t.me/vpnaxon_bot?start=login_'+'A'.repeat(43)});
    if(path==='/auth/bot/status')return json({status:'PENDING'});
    if(path==='/auth/bot/cancel')return json({ok:true});
    if(path==='/auth/code'){logged=true;return json({id:uid,role});}
    if(!logged)return json({error:'LOGIN_REQUIRED'},401);
    if(path==='/subscriptions')return json(sub?[sub]:[]);
    if(path==='/notifications') {if(method==='POST')preference={...body};return json(preference);}
    if(path==='/orders'&&method==='POST')return json({id:'44444444-4444-4444-8444-444444444444',status:'AWAITING_PAYMENT',amount:17000,currency:'RUB'});
    if(/^\/orders\/[^/]+\/payment$/.test(path)){sub=sub?{...sub,expiresAt:new Date(Date.parse(sub.expiresAt)+30*86400000).toISOString()}:subscription();return json({status:'COMPLETED'});}
    if(path==='/support'&&method==='POST')return json({id:'55555555-5555-4555-8555-555555555555',number:7,status:'OPEN',text:body.text});
    if(path.startsWith('/account/lists/')){
      const resource=path.split('/').at(-1);let items=[];let nextCursor=null;let total=1;
      if(resource==='orders'){
        const pending={id:'66666666-6666-4666-8666-666666666666',status:'AWAITING_PAYMENT',amount:17000,currency:'RUB',createdAt:new Date().toISOString()};
        const completed={...pending,id:'77777777-7777-4777-8777-777777777777',status:'COMPLETED'};
        items=url.searchParams.has('cursor')?[{...completed,id:'88888888-8888-4888-8888-888888888888'}]:[pending,completed];nextCursor=url.searchParams.has('cursor')?null:'fixture-next';total=3;
      }else if(resource==='subscriptions')items=sub?[{...sub,createdAt:sub.startedAt}]:[];
      else items=[{id:'99999999-9999-4999-8999-999999999999',number:7,status:'OPEN',text:'<img src=x onerror="window.fixtureXss=true">',createdAt:new Date().toISOString()}];
      if(url.searchParams.get('status')){items=items.filter(x=>x.status===url.searchParams.get('status'));nextCursor=null;total=items.length;}
      if(url.searchParams.get('search')==='пусто'){items=[];nextCursor=null;total=0;}
      return json({items,nextCursor,total});
    }
    if(path.startsWith('/admin')){
      if(role!=='ADMIN')return json({error:'ADMIN_REQUIRED'},403);
      if(path==='/admin')return json({stats:{users:3,active:2,orders:4,servers:1,occupied:2,available:1,errors:0,revenueMinor:68000,expenseMinor:20000},plans:[plan],settings:[]});
      if(path==='/admin/diagnostics')return json({database:{latencyMs:12},jobs:[{status:'DONE',count:12}],inbox:[{status:'DONE',count:8}],workers:[{mode:'INLINE',status:'RUNNING',stale:false,lastSeenAt:new Date().toISOString()}],webhook:{state:'ready'},oldestDueDelaySeconds:0,recoveryErrors:0,activeUsers:2,activeServers:1,occupiedSlots:2});
      if(path.startsWith('/admin/lists/')){const resource=path.split('/').at(-1);const items=resource==='jobs'?[{id:'10101010-1010-4010-8010-101010101010',kind:'NOTIFY',key:'notification:fixture',status:'DEAD',attempts:1,maxAttempts:8,runAt:new Date().toISOString(),lastError:'DELIVERY_UNKNOWN'}]:resource==='users'?[{id:uid,role:'USER',status:'ACTIVE',identities:[{providerUserId:'1001'}],_count:{subscriptions:1}}]:[{externalServerId:'demo:vps:fixture',status:'ACTIVE',slots:[{slotNumber:1,status:'OCCUPIED'}],expiresAt:new Date().toISOString()}];return json({items,nextCursor:null,total:1});}
    }
    unexpected.push({path,method});return json({error:'UNHANDLED_FIXTURE'},501);
  });
  return {requests,errors,unexpected,getPreference:()=>preference};
}
async function ready(page,path='/'){await page.goto('/#'+path);await page.waitForLoadState('networkidle');await expect(page.locator('#page')).toHaveAttribute('aria-busy','false');}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}

test('desktop public AXON, theme and accessible login fallback',async({page})=>{
  const f=await fixtures(page,{logged:false,sdkOffline:true});await ready(page);
  await expect(page.getByRole('heading',{name:/Меньше шума/})).toBeVisible();await noOverflow(page);
  await page.screenshot({path:'ui-results/desktop-home.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Переключить тему'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.screenshot({path:'ui-results/desktop-light.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Войти через Telegram',exact:true}).click();await expect(page.getByRole('button',{name:'Войти по коду',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Войти по коду',exact:true}).click();await page.getByLabel('8 цифр из бота').fill('12345678');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ваше пространство.'})).toBeVisible();expect(f.requests.find(x=>x.path==='/auth/code')?.headers['x-shared-vps']).toBe('1');expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('mobile Mini App purchase, renewal, settings and native navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});const f=await fixtures(page,{logged:false,mini:true,empty:true});await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-mini-app','true');expect(await page.evaluate(()=>window.__tgCalls)).toEqual(['ready','expand']);
  await expect(page.getByRole('heading',{name:'Ваше пространство.'})).toBeVisible();await noOverflow(page);await page.screenshot({path:'ui-results/mini-dashboard.png',fullPage:true,animations:'disabled'});
  await page.locator('.bottom-nav').getByRole('link',{name:'Каталог',exact:true}).click();await page.getByRole('button',{name:/Оформить тестовую подписку/}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Подписка под контролем.'})).toBeVisible();await page.getByRole('button',{name:/Продлить демо/}).click();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.getByText('60 дней осталось')).toBeVisible();
  const writes=f.requests.filter(x=>x.path==='/orders'&&x.method==='POST');expect(writes).toHaveLength(2);expect(writes[1].body.renewalId).toBeTruthy();expect(writes.every(x=>x.headers['x-shared-vps']==='1')).toBe(true);
  await page.screenshot({path:'ui-results/mini-subscription.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>window.__tgSettings());await page.getByRole('checkbox',{name:/Напоминания о подписке/}).check();await page.getByRole('button',{name:'Сохранить настройки'}).click();await expect(page.getByRole('status').filter({hasText:'Настройки уведомлений сохранены.'})).toBeVisible();expect(f.getPreference().remindersEnabled).toBe(true);
  await page.evaluate(()=>window.__tgBack());await expect(page.getByRole('heading',{name:'Ваше пространство.'})).toBeVisible();expect(await page.evaluate(()=>window.__tgBackVisible)).toBe(false);await noOverflow(page);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('mobile history, search, pagination, support and profile',async({page})=>{
  await page.setViewportSize({width:360,height:780});await page.emulateMedia({reducedMotion:'reduce'});const f=await fixtures(page);await ready(page,'/orders');await expect(page.locator('#account-records .history-card')).toHaveCount(2);await page.getByRole('button',{name:'Далее →',exact:true}).click();await expect(page.locator('#account-page')).toHaveText('Страница 2');expect(f.requests.some(x=>x.query.includes('cursor=fixture-next'))).toBe(true);
  await page.getByRole('textbox',{name:'Поиск',exact:true}).fill('пусто');await page.getByRole('button',{name:'Применить',exact:true}).click();await expect(page.getByRole('heading',{name:'Здесь пока тихо'})).toBeVisible();await noOverflow(page);
  for(const path of ['/profile','/support','/history','/connect','/renew','/instructions','/notifications']){await ready(page,path);await noOverflow(page);}
  await page.setViewportSize({width:320,height:700});for(const path of ['/profile','/catalog','/connect']){await ready(page,path);await noOverflow(page);}await page.setViewportSize({width:360,height:780});
  await ready(page,'/support');await expect(page.locator('#account-records')).toContainText('<img src=x');expect(await page.evaluate(()=>window.fixtureXss)).toBeUndefined();await expect(page.locator('#account-records img')).toHaveCount(0);
  await page.getByLabel('Чем можем помочь?').fill('Не получается открыть демонстрационное подключение.');await page.getByRole('button',{name:'Отправить обращение'}).click();await expect(page.getByRole('status').filter({hasText:'Обращение №7 сохранено'})).toBeVisible();
  await ready(page,'/profile');await page.screenshot({path:'ui-results/mobile-profile.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Выйти из аккаунта'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();expect(f.requests.some(x=>x.path==='/auth/logout')).toBe(false);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('Mini App checks an existing cookie account, handles mismatch and accepts a known replay',async({page})=>{
  const f=await fixtures(page,{mini:true,mismatch:true});await ready(page,'/profile');await expect(page.getByRole('heading',{name:'Подключим ваш Telegram.'})).toBeVisible();await expect(page.getByText('ID аккаунта:',{exact:false})).toHaveCount(0);await page.getByRole('button',{name:'Подключить текущий аккаунт'}).click();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.getByRole('heading',{name:'Ваше пространство.'})).toBeVisible();expect(f.requests.filter(x=>x.path==='/auth/telegram')).toHaveLength(2);expect(f.errors).toEqual([]);
  const second=await page.context().newPage();const replay=await fixtures(second,{mini:true,replay:true});await ready(second,'/profile');await expect(second.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();expect(replay.requests.some(x=>x.path==='/auth/telegram')).toBe(true);await second.close();
});
test('ADMIN pagination and diagnostics retain guarded operations on a small screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});const f=await fixtures(page,{admin:true});await ready(page,'/admin');await expect(page.getByRole('heading',{name:'Диагностика',exact:true})).toBeVisible();await expect(page.locator('#diagnostics')).toContainText('ready');await noOverflow(page);
  await page.getByRole('button',{name:'Фоновые задачи',exact:true}).click();await expect(page.locator('#list-records')).toContainText('DELIVERY_UNKNOWN');await expect(page.locator('[data-job-retry]')).toHaveCount(0);await page.screenshot({path:'ui-results/mobile-admin.png',fullPage:true,animations:'disabled'});expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('USER cannot open the administrative UI and a slow page cannot overwrite a new route',async({page})=>{
  const f=await fixtures(page);await ready(page,'/admin');await expect(page.getByRole('heading',{name:'Доступ ограничен'})).toBeVisible();expect(f.requests.some(x=>x.path==='/admin')).toBe(false);
  let release;let entered;const started=new Promise(resolve=>{entered=resolve;});await page.route('**/api/v1/subscriptions',async route=>{entered();await new Promise(resolve=>{release=resolve;});return route.fulfill({contentType:'application/json',body:JSON.stringify([subscription()])});});
  await page.locator('.site-nav').getByRole('link',{name:'Подписка',exact:true}).click();await started;
  await page.locator('.site-nav').getByRole('link',{name:'Профиль',exact:true}).click();await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();const completed=page.waitForResponse(r=>r.url().endsWith('/api/v1/subscriptions'));release();await completed;await page.waitForLoadState('networkidle');await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();await noOverflow(page);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
