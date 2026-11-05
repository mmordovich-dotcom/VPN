import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../apps/web/dist',import.meta.url));
let server;
test.beforeAll(async()=>{
  await mkdir('ui-results',{recursive:true});
  server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(404);res.end();return;}const file=path===root?resolve(root,'index.html'):path;const data=await readFile(file);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
const uid='11111111-1111-4111-8111-111111111111';
const plan={id:'22222222-2222-4222-8222-222222222222',name:'Basic',price:17000,currency:'RUB',durationDays:30,maxUsersPerServer:3,isActive:true};
function subscription(){return {id:'33333333-3333-4333-8333-333333333333',userId:uid,planId:plan.id,plan,status:'ACTIVE',startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString(),credentials:[{demoIdentifier:'demo:axon:fixture',revokedAt:null}],serverSlot:{server:{externalServerId:'demo:vps:fixture'}}};}
async function fixtures(page,options={}){
  let logged=options.logged!==false;let sub=options.empty?null:subscription();let preference={remindersEnabled:false,updatesEnabled:true};let mismatch=Boolean(options.mismatch);
  if(options.mini)await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'signed-fixture-only'}};});
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
    if(path==='/auth/config')return json({botUsername:'vpnaxon_bot',loginEnabled:true,loginMode:'bot',stage:'1.6',demo:true,publicWebMode:options.landing?'landing':'full'});
    if(path==='/me')return json(logged?{id:uid,role,miniApp:options.miniVerified!==false&&Boolean(options.mini)}:{error:'LOGIN_REQUIRED'},logged?200:401);
    if(path==='/plans')return json([plan]);
    if(path==='/auth/telegram'){
      if(options.invalidMini)return json({error:'INVALID_INIT_DATA'},401);
      if(mismatch&&logged)return json({error:'AUTH_LOGOUT_FIRST'},409);
      if(options.replay&&logged)return json({error:'LOGIN_REPLAY'},401);
      logged=true;return json({id:uid,role,miniApp:true});
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
    if(/^\/orders\/[^/]+$/.test(path))return json({order:{id:path.split('/').at(-1),status:options.pendingCheckout?'PAID':'COMPLETED',amount:17000,currency:'RUB'},activated:!options.pendingCheckout&&Boolean(sub),subscription:sub});
    if(path==='/account/service-status')return json({status:'NO_CONFIRMED_INCIDENT',message:'Подтверждённых инцидентов нет.',demo:true});
    if(path==='/account/compensations')return json([]);
    if(/^\/support\/[^/]+$/.test(path))return json({ticket:{id:path.split('/').at(-1),number:7,status:'WAITING_USER',category:'INSTRUCTIONS'},messages:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',authorRole:'USER',text:'Нужна инструкция',createdAt:new Date().toISOString()},{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',authorRole:'ADMIN',text:'Откройте Инструкции. <script>window.fixtureXss=true</script>',createdAt:new Date().toISOString()}],nextCursor:null});
    if(/^\/support\/[^/]+\/messages$/.test(path))return json({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});
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
      if(path==='/admin/readiness')return json({capacity4Approved:false,incidents:[],compensations:[]});
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
  await page.setViewportSize({width:390,height:844});const f=await fixtures(page,{logged:false,mini:true,empty:true,landing:true});await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-mini-app','true');expect(await page.evaluate(()=>window.__tgCalls)).toEqual(['ready','expand']);
  await expect(page.getByRole('heading',{name:'Ваше пространство.'})).toBeVisible();await noOverflow(page);await page.screenshot({path:'ui-results/mini-dashboard.png',fullPage:true,animations:'disabled'});await page.screenshot({path:'ui-results/mini-dashboard-viewport.png',animations:'disabled'});
  await page.locator('.bottom-nav').getByRole('link',{name:'Каталог',exact:true}).click();await page.getByRole('button',{name:/Оформить тестовую подписку/}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Подписка активна.'})).toBeVisible();await page.getByRole('link',{name:'Моя подписка',exact:true}).click();await expect(page.getByRole('heading',{name:'Подписка под контролем.'})).toBeVisible();await page.getByRole('button',{name:/Продлить демо/}).click();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.getByRole('heading',{name:'Подписка активна.'})).toBeVisible();await page.getByRole('link',{name:'Моя подписка',exact:true}).click();await expect(page.getByText('60 дней осталось')).toBeVisible();
  const writes=f.requests.filter(x=>x.path==='/orders'&&x.method==='POST');expect(writes).toHaveLength(2);expect(writes[1].body.renewalId).toBeTruthy();expect(writes.every(x=>x.headers['x-shared-vps']==='1')).toBe(true);
  await page.screenshot({path:'ui-results/mini-subscription.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>window.__tgSettings());await page.getByRole('checkbox',{name:/Напоминания о подписке/}).check();await page.getByRole('button',{name:'Сохранить настройки'}).click();await expect(page.getByRole('status').filter({hasText:'Настройки уведомлений сохранены.'})).toBeVisible();expect(f.getPreference().remindersEnabled).toBe(true);
  await page.evaluate(()=>window.__tgBack());await expect(page.getByRole('heading',{name:'Подписка под контролем.'})).toBeVisible();expect(await page.evaluate(()=>window.__tgBackVisible)).toBe(true);await noOverflow(page);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
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
  const f=await fixtures(page,{mini:true,mismatch:true,landing:true});await ready(page,'/profile');await expect(page.getByRole('heading',{name:'Подключим ваш Telegram.'})).toBeVisible();await expect(page.getByText('ID аккаунта:',{exact:false})).toHaveCount(0);await page.getByRole('button',{name:'Подключить текущий аккаунт'}).click();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.getByRole('heading',{name:'Ваше пространство.'})).toBeVisible();expect(f.requests.filter(x=>x.path==='/auth/telegram')).toHaveLength(2);expect(f.errors).toEqual([]);
  const second=await page.context().newPage();const replay=await fixtures(second,{mini:true,replay:true,landing:true});await ready(second,'/profile');await expect(second.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();expect(replay.requests.some(x=>x.path==='/auth/telegram')).toBe(true);await second.close();
});
test('ADMIN pagination and diagnostics retain guarded operations on a small screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});const f=await fixtures(page,{admin:true,landing:true});await ready(page,'/admin');await expect(page.getByRole('heading',{name:'Диагностика',exact:true})).toBeVisible();await expect(page.locator('#diagnostics')).toContainText('ready');await noOverflow(page);
  await page.getByRole('button',{name:'Фоновые задачи',exact:true}).click();await expect(page.locator('#list-records')).toContainText('DELIVERY_UNKNOWN');await expect(page.locator('[data-job-retry]')).toHaveCount(0);await page.screenshot({path:'ui-results/mobile-admin.png',fullPage:true,animations:'disabled'});expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('USER cannot open the administrative UI and a slow page cannot overwrite a new route',async({page})=>{
  const f=await fixtures(page);await ready(page,'/admin');await expect(page.getByRole('heading',{name:'Доступ ограничен'})).toBeVisible();expect(f.requests.some(x=>x.path==='/admin')).toBe(false);
  let release;let entered;const started=new Promise(resolve=>{entered=resolve;});await page.route('**/api/v1/subscriptions',async route=>{entered();await new Promise(resolve=>{release=resolve;});return route.fulfill({contentType:'application/json',body:JSON.stringify([subscription()])});});
  await page.locator('.site-nav').getByRole('link',{name:'Подписка',exact:true}).click();await started;
  await page.locator('.site-nav').getByRole('link',{name:'Профиль',exact:true}).click();await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();const completed=page.waitForResponse(r=>r.url().endsWith('/api/v1/subscriptions'));release();await completed;await page.waitForLoadState('networkidle');await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();await noOverflow(page);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});

test('Stage 1.5 instructions precede purchase and remain accessible after activation',async({page})=>{
  const f=await fixtures(page,{empty:true});await ready(page,'/catalog');await expect(page.getByText(/После оформления вы получите пошаговую инструкцию/)).toBeVisible();await page.getByRole('button',{name:/Оформить тестовую подписку/}).click();await expect(page.getByRole('dialog')).toContainText('Дождитесь статуса');await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.getByRole('heading',{name:'Подписка активна.'})).toBeVisible();await page.getByRole('link',{name:'Открыть инструкцию',exact:true}).click();for(const platform of ['Android','iOS','Windows','macOS']){await page.getByRole('button',{name:platform,exact:true}).click();await expect(page.locator('#instruction-platform-title')).toContainText(platform);}await expect(page.locator('#page')).toContainText('в сторонние приложения не нужно');await noOverflow(page);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);await page.screenshot({path:'ui-results/readiness-instructions.png',fullPage:true,animations:'disabled'});
});
test('Stage 1.5 pending activation cannot show a false success',async({page})=>{const f=await fixtures(page,{pendingCheckout:true});await ready(page,'/checkout?order=44444444-4444-4444-8444-444444444444');await expect(page.getByRole('heading',{name:'Проверим статус заказа.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Подписка активна.'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Обновить статус',exact:true})).toBeVisible();await expect(page.getByText(/Не создавайте повторный заказ/)).toBeVisible();expect(f.errors).toEqual([]);});
test('Stage 1.5 support thread escapes content and sends an owned reply in the Mini App',async({page})=>{await page.setViewportSize({width:360,height:780});const f=await fixtures(page,{mini:true,landing:true});await ready(page,'/support?ticket=55555555-5555-4555-8555-555555555555');await expect(page.getByRole('heading',{name:'Обращение №7'})).toBeVisible();await expect(page.locator('.thread-messages')).toContainText('<script>');expect(await page.evaluate(()=>window.fixtureXss)).toBeUndefined();await page.getByLabel('Ваш ответ', {exact:false}).fill('Спасибо, разобрался.');await page.getByRole('button',{name:'Отправить ответ',exact:true}).click();await expect.poll(()=>f.requests.filter(x=>x.path.endsWith('/messages')).length).toBe(1);expect(f.requests.some(x=>x.path.startsWith('/admin'))).toBe(false);await expect(page.locator('#toast')).not.toContainText('Этот раздел доступен только администратору');await noOverflow(page);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);await page.screenshot({path:'ui-results/readiness-support.png',fullPage:true,animations:'disabled'});});
test('Stage 1.5 finance distinguishes underfill and keeps four-user approval off',async({page})=>{const f=await fixtures(page,{admin:true});await ready(page,'/admin');await expect(page.locator('#finance-result')).toContainText('Остаток после аренды');await expect(page.locator('#finance-result')).toContainText('не является чистой прибылью');await page.getByLabel('Пользователей',{exact:true}).fill('1');await page.getByRole('button',{name:'Пересчитать',exact:true}).click();await expect(page.locator('#finance-result')).toContainText('-3');expect(f.requests.some(x=>x.path==='/admin/capacity')).toBe(false);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);});

test('Telegram-first landing is the ordinary browser interface in both themes',async({page})=>{
 const f=await fixtures(page,{landing:true,logged:false,sdkOffline:true});await ready(page);
 await expect(page.getByRole('heading',{name:/Всё необходимое/})).toBeVisible();
 await expect(page.getByRole('link',{name:/Открыть AXON в Telegram/})).toHaveAttribute('href','https://t.me/vpnaxon_bot');
 await expect(page.locator('.site-nav')).toBeHidden();await expect(page.locator('.bottom-nav')).toBeHidden();await expect(page.locator('.demo-toolbar')).toBeHidden();
 await expect(page.locator('#page')).toContainText('Полноценная веб-версия появится позже');await noOverflow(page);
 await page.screenshot({path:'ui-results/telegram-first-landing-dark.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Переключить тему'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.screenshot({path:'ui-results/telegram-first-landing-light.png',fullPage:true,animations:'disabled'});
 expect(f.requests.some(x=>['/orders','/subscriptions','/support'].includes(x.path))).toBe(false);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('retained user routes and forged URL flags cannot expose the normal browser application',async({page})=>{
 const f=await fixtures(page,{landing:true,miniVerified:false});await page.setViewportSize({width:320,height:720});
 for(const path of ['/catalog','/subscriptions','/orders','/support','/profile','/history','/instructions','/notifications','/renew','/connect','/checkout?order=44444444-4444-4444-8444-444444444444','/profile?miniapp=1&admin=1']){
  await ready(page,path);await expect(page.getByRole('heading',{name:/Всё необходимое/})).toBeVisible();await noOverflow(page);
 }
 expect(f.requests.filter(x=>x.path==='/orders'&&x.method==='POST')).toHaveLength(0);expect(f.requests.some(x=>['/subscriptions','/support'].includes(x.path))).toBe(false);
 await page.screenshot({path:'ui-results/telegram-first-landing-mobile.png',fullPage:true,animations:'disabled'});expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('a fake SDK launch and an ordinary cookie do not grant verified Mini App access',async({page})=>{
 const f=await fixtures(page,{landing:true,mini:true,invalidMini:true,miniVerified:false});await ready(page,'/profile');
 await expect(page.locator('html')).toHaveAttribute('data-public-site','true');await expect(page.getByRole('heading',{name:'Вы подключены.'})).toHaveCount(0);
 expect(f.requests.some(x=>x.path==='/auth/telegram')).toBe(true);expect(f.requests.some(x=>['/subscriptions','/orders'].includes(x.path))).toBe(false);expect(f.errors).toEqual([]);
});
test('browser ADMIN login remains separate from the public landing and USER gains no ADMIN',async({page})=>{
 const admin=await fixtures(page,{landing:true,logged:false,admin:true});await ready(page,'/admin');await expect(page.getByRole('heading',{name:'Вход администратора.'})).toBeVisible();
 await page.getByRole('button',{name:'Войти по коду',exact:true}).click();await page.getByLabel('8 цифр из бота').fill('12345678');await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.getByRole('heading',{name:'Админ-панель',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Диагностика',exact:true})).toBeVisible();
 expect(admin.requests.some(x=>x.path==='/admin')).toBe(true);expect(admin.errors).toEqual([]);expect(admin.unexpected).toEqual([]);
 const other=await page.context().newPage();const user=await fixtures(other,{landing:true});await ready(other,'/admin');await expect(other.getByRole('heading',{name:'Доступ ограничен'})).toBeVisible();expect(user.requests.some(x=>x.path.startsWith('/admin'))).toBe(false);await other.close();
});
test('production-mode Mini App keeps safe areas, themes, keyboard states and contextual Back at 320-390px',async({page})=>{
 const f=await fixtures(page,{landing:true,mini:true});await page.setViewportSize({width:390,height:844});await ready(page);
 for(const width of [320,360,390]){await page.setViewportSize({width,height:780});await page.locator('.bottom-nav').getByRole('link',{name:'Профиль',exact:true}).click();await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();await noOverflow(page);await page.locator('.quick-links a[href="#/instructions"]').click();await expect(page.getByRole('heading',{name:'Инструкция всегда рядом.'})).toBeVisible();await page.evaluate(()=>window.__tgBack());await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();}
 await page.evaluate(()=>{window.Telegram.WebApp.colorScheme='light';window.__tgEvents.themeChanged();});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.screenshot({path:'ui-results/telegram-first-mini-light.png',fullPage:true,animations:'disabled'});
 await page.locator('.quick-links a[href="#/support"]').click();await page.getByLabel('Чем можем помочь?').fill('Проверка небольшого экрана');
 await page.evaluate(()=>{window.Telegram.WebApp.viewportHeight=430;window.__tgEvents.viewportChanged();});await expect(page.locator('html')).toHaveAttribute('data-keyboard-open','true');await expect(page.locator('.bottom-nav')).toBeHidden();await noOverflow(page);
 await page.evaluate(()=>{window.Telegram.WebApp.viewportHeight=740;window.__tgEvents.viewportChanged();});await expect(page.locator('.bottom-nav')).toBeVisible();expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('authenticated Mini App with invalid signature never falls through to a browser user screen',async({page})=>{
 const f=await fixtures(page,{landing:true,mini:true,invalidMini:true,logged:false});await ready(page,'/subscriptions');
 await expect(page.getByRole('heading',{name:/Всё необходимое/})).toBeVisible();expect(f.requests.some(x=>x.path==='/subscriptions')).toBe(false);expect(f.errors).toEqual([]);
});
test('Bot API media payload has a labelled visual preview, without pretending to be Telegram',async({page})=>{
 const {inlineMainMenu}=await import('../../apps/api/src/bot-ui.ts');
 const {BotPresentation}=await import('../../apps/api/src/bot-presentation.ts');
 const {botVisualConfig}=await import('../../apps/api/src/bot-visual-config.ts');
 const presentation=new BotPresentation('https://shared-vps-api.onrender.com',async()=>({}),{...botVisualConfig,emoji:{...botVisualConfig.emoji,enabled:false}});
 const payload=await presentation.prepare({method:'sendMessage',section:'main',body:{chat_id:1,text:'AXON\n\nУправляйте подпиской, просматривайте инструкции и получайте поддержку прямо в Telegram.\n\nДемонстрационная версия: списание 0 ₽. Реальные платежи и подключения недоступны.',reply_markup:inlineMainMenu('https://shared-vps-api.onrender.com')}});
 await page.route('http://127.0.0.1:4173/bot-menu-preview',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ru"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#111318;color:#f4f4f2;font:15px system-ui;padding:20px;max-width:460px}small{color:#a5abb7;line-height:1.6;display:block}article{overflow:hidden;border:1px solid #ffffff20;background:#1d2026;border-radius:16px;margin-top:20px}img{display:block;width:100%;height:auto}p{padding:0 18px;white-space:pre-wrap;line-height:1.6}button{display:block;width:100%;min-height:52px;border:1px solid #ffffff20;border-radius:12px;color:inherit;background:#282c35;margin-top:8px;font:600 15px system-ui}button[data-style=success]{background:#2d5a43}button[data-style=primary]{background:#254b70}body[data-theme=light]{background:#f0f2f5;color:#17202a}body[data-theme=light] article{background:white;border-color:#ddd}body[data-theme=light] button{background:#e0e6ed;color:#17202a}body[data-theme=light] button[data-style=success]{background:#d4e9dc}body[data-theme=light] button[data-style=primary]{background:#d3e5f7}</style><small>ПРЕДПРОСМОТР BOT API · НЕ НАСТОЯЩИЙ TELEGRAM<br>Premium-ID здесь не имитируются.</small><article><img id="banner" alt="Фирменный баннер AXON"><p id="caption"></p></article><div id="buttons"></div><script>const payload='+JSON.stringify(payload)+';document.getElementById("banner").src=new URL(payload.body.photo).pathname;document.getElementById("caption").textContent=payload.body.caption;for(const row of payload.body.reply_markup.inline_keyboard){for(const item of row){const b=document.createElement("button");b.textContent=item.text;b.dataset.style=item.style||"";document.getElementById("buttons").append(b);}}</script></html>'}));
 await page.setViewportSize({width:390,height:880});await page.goto('/bot-menu-preview');await expect(page.getByRole('button')).toHaveCount(5);await expect(page.locator('#banner')).toBeVisible();expect(await page.locator('#banner').evaluate(img=>img.naturalWidth)).toBeGreaterThan(1000);await expect(page.locator('#caption')).toContainText('AXON · Главное меню');await noOverflow(page);await page.screenshot({path:'ui-results/telegram-first-bot-menu-preview.png',fullPage:true,animations:'disabled'});
 await page.evaluate(()=>document.body.dataset.theme='light');await noOverflow(page);await page.screenshot({path:'ui-results/axon-bot-media-light.png',fullPage:true,animations:'disabled'});await page.setViewportSize({width:320,height:740});await noOverflow(page);await page.screenshot({path:'ui-results/axon-bot-media-mobile.png',fullPage:true,animations:'disabled'});
});

test('Android and iOS device profiles launch the full Mini App in Chromium SDK emulation',async({browser})=>{
 for(const device of [{name:'android',userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',width:393,height:851,scale:2},{name:'ios',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',width:390,height:844,scale:2}]){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:device.width,height:device.height},userAgent:device.userAgent,isMobile:true,hasTouch:true,deviceScaleFactor:device.scale});
  try{const page=await context.newPage();const f=await fixtures(page,{mini:true,landing:true});await ready(page,'/subscriptions');await expect(page.getByRole('heading',{name:'Подписка под контролем.'})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-public-site','false');await page.locator('.bottom-nav').getByRole('link',{name:'Профиль',exact:true}).click();await expect(page.getByRole('heading',{name:'Вы подключены.'})).toBeVisible();await page.locator('.quick-links a[href="#/support"]').click();await expect(page.getByLabel('Чем можем помочь?')).toBeVisible();await noOverflow(page);await page.screenshot({path:'ui-results/telegram-first-'+device.name+'-emulation.png',fullPage:true,animations:'disabled'});expect(f.requests.some(x=>x.path==='/auth/telegram')).toBe(true);expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);}finally{await context.close();}
 }
});

// Stage 1.7: actual Mini App markup, production landing mode and signed-identity API fixture.
test('Liquid Glass screens keep mobile geometry in dark and light Telegram themes',async({page})=>{
 test.setTimeout(180000);
 const f=await fixtures(page,{mini:true,landing:true});
 const screens=[['home','/'],['catalog','/catalog'],['subscription','/subscriptions'],['history','/orders'],['profile','/profile'],['support','/support'],['thread','/support?ticket=55555555-5555-4555-8555-555555555555'],['settings','/notifications'],['instructions','/instructions']];
 for(const width of [320,360,390]){
  await page.setViewportSize({width,height:844});
  for(const [name,path] of screens){await ready(page,path);await noOverflow(page);await expect(page.locator('.bottom-nav')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-public-site','false');if(name==='catalog'&&width===390){const cta=await page.locator('.plan .primary').boundingBox();const dock=await page.locator('.bottom-nav').boundingBox();expect(cta.y+cta.height).toBeLessThanOrEqual(dock.y);}await page.screenshot({path:'ui-results/liquid-'+width+'-'+name+'.png',fullPage:true,animations:'disabled'});if(name==='home'||name==='catalog')await page.screenshot({path:'ui-results/liquid-'+width+'-'+name+'-viewport.png',animations:'disabled'});}
 }
 await page.setViewportSize({width:390,height:844});
 for(const [name,path] of screens){await ready(page,path);await page.evaluate(()=>{window.Telegram.WebApp.colorScheme='light';window.__tgEvents.themeChanged();});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await noOverflow(page);await page.screenshot({path:'ui-results/liquid-light-'+name+'.png',fullPage:true,animations:'disabled'});}
 expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});

test('Liquid dock is inset, tracks the selected route and keeps the last content reachable',async({browser})=>{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:320,height:780},recordVideo:{dir:'ui-results/liquid-dock-video',size:{width:320,height:780}}});const page=await context.newPage();try{
 await page.setViewportSize({width:320,height:780});const f=await fixtures(page,{mini:true,landing:true});await ready(page);
 const dock=page.locator('.bottom-nav');const box=await dock.boundingBox();expect(box.x).toBeGreaterThanOrEqual(8);expect(box.x+box.width).toBeLessThanOrEqual(312);expect(box.y+box.height).toBeLessThanOrEqual(780-16);
 await dock.getByRole('link',{name:'Каталог',exact:true}).click();await expect(dock.getByRole('link',{name:'Каталог',exact:true})).toHaveAttribute('aria-current','page');await expect.poll(()=>dock.evaluate(e=>getComputedStyle(e).getPropertyValue('--dock-index'))).toBe('1');
 await dock.getByRole('link',{name:'Подписка',exact:true}).click();await expect(dock.getByRole('link',{name:'Подписка',exact:true})).toHaveAttribute('aria-current','page');await expect.poll(()=>dock.evaluate(e=>getComputedStyle(e).getPropertyValue('--dock-index'))).toBe('2');
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));const last=page.locator('footer .admin-entry');const end=await last.boundingBox();const fixed=await dock.boundingBox();expect(end.y+end.height).toBeLessThanOrEqual(fixed.y);await noOverflow(page);expect(f.errors).toEqual([]);
 }finally{await context.close();}
});

test('Liquid sheet preserves focus, cancellation and a single confirmed demo mutation at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:640});const f=await fixtures(page,{mini:true,landing:true,empty:true});await ready(page,'/catalog');
 const buy=page.getByRole('button',{name:/Оформить тестовую подписку/});await buy.click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Списание 0 ₽');await expect(dialog).toContainText('Дождитесь статуса');await expect(dialog).toBeVisible();expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);await noOverflow(page);await page.screenshot({path:'ui-results/liquid-320-confirmation.png',animations:'disabled'});await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(f.requests.filter(r=>r.path==='/orders'&&r.method==='POST')).toHaveLength(0);
 await buy.click();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.getByRole('heading',{name:'Подписка активна.'})).toBeVisible();expect(f.requests.filter(r=>r.path==='/orders'&&r.method==='POST')).toHaveLength(1);await noOverflow(page);await page.screenshot({path:'ui-results/liquid-success.png',fullPage:true,animations:'disabled'});expect(f.errors).toEqual([]);expect(f.unexpected).toEqual([]);
});

test('Liquid accessibility preferences remove motion and offer solid surfaces',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const f=await fixtures(page,{mini:true,landing:true});await ready(page);
 expect(await page.locator('#page').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');expect(await page.locator('.bottom-nav').evaluate(e=>getComputedStyle(e,'::before').transitionDuration)).toBe('0s');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'}]});expect(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);await expect(page.locator('.dashboard-status')).toHaveCSS('backdrop-filter','none');await noOverflow(page);await page.screenshot({path:'ui-results/liquid-reduced-effects.png',animations:'disabled'});expect(f.errors).toEqual([]);
});

test('Liquid loading and failure states remain honest and recoverable',async({page})=>{
 await page.setViewportSize({width:360,height:780});const f=await fixtures(page,{mini:true,landing:true});await ready(page,'/profile');let release;const gate=new Promise(r=>release=r);await page.route('**/api/v1/plans',async route=>{await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEMPORARY_UNAVAILABLE'})});});
 await page.locator('.bottom-nav').getByRole('link',{name:'Каталог',exact:true}).click();await expect(page.locator('.loading-panel')).toBeVisible();await expect(page.locator('#page')).toHaveAttribute('aria-busy','true');await page.screenshot({path:'ui-results/liquid-loading.png',animations:'disabled'});release();await expect(page.getByRole('heading',{name:'Небольшая пауза.'})).toBeVisible();await expect(page.getByRole('button',{name:'Повторить',exact:true})).toBeVisible();await noOverflow(page);await page.screenshot({path:'ui-results/liquid-error.png',animations:'disabled'});expect(f.requests.some(r=>r.path==='/orders'&&r.method==='POST')).toBe(false);expect(f.errors).toEqual([]);
});

test('Liquid empty dashboard offers the catalog without pretending access is active',async({page})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixtures(page,{mini:true,landing:true,empty:true});await ready(page);await expect(page.getByRole('heading',{name:'Ваш первый шаг.'})).toBeVisible();await expect(page.getByRole('link',{name:'Выбрать тариф',exact:false})).toBeVisible();await expect(page.locator('.dashboard-time')).toHaveCount(0);await noOverflow(page);await page.screenshot({path:'ui-results/liquid-empty.png',animations:'disabled'});expect(f.errors).toEqual([]);
});

// Cross-site embedding uses the real production cookie builder and Chromium's cookie store.
async function embedCookieProbe(page,cookie){
 await page.route('https://**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='app.axon-cookie.test'){await route.fulfill({contentType:'text/html',body:'<iframe title="Mini App cookie probe" src="https://app.axon-cookie.test/?mode='+url.searchParams.get('mode')+'"></iframe>'});return;}
  if(url.pathname==='/set'){await route.fulfill({headers:{'set-cookie':cookie},contentType:'application/json',body:'{}'});return;}
  if(url.pathname==='/check'){await route.fulfill({contentType:'application/json',body:JSON.stringify({received:Boolean(route.request().headers().cookie?.includes(cookie.split('=')[0]+'='))})});return;}
  await route.fulfill({contentType:'text/html',body:'<p id="result">Loading</p><script>(async()=>{const before=await(await fetch("/check")).json();if(new URLSearchParams(location.search).get("mode")!=="read")await fetch("/set",{method:"POST"});const after=await(await fetch("/check")).json();document.querySelector("#result").textContent=JSON.stringify({before:before.received,after:after.received,visible:document.cookie.includes("sharedvps")});})()</script>'});
 });
 return async(host,mode='set')=>{await page.goto('https://'+host+'-shell.test/?mode='+mode);const result=page.frameLocator('iframe').locator('#result');await expect(result).not.toHaveText('Loading');return JSON.parse(await result.textContent());};
}
test('Telegram Web reproduces Lax loss while production partitioned cookies survive and stay HttpOnly',async({page})=>{
 const {cookieHeader,sessionCookieName}=await import('../../apps/api/src/session-cookie.ts');
 let probe=await embedCookieProbe(page,'__Host-legacy-probe='+ 'A'.repeat(43)+'; Path=/; Secure; HttpOnly; SameSite=Lax');
 expect((await probe('telegram')).after).toBe(false);
 await page.unroute('https://**/*');
 probe=await embedCookieProbe(page,cookieHeader(sessionCookieName(true),'B'.repeat(43),600,true));
 expect(await probe('telegram')).toEqual({before:false,after:true,visible:false});
 expect(await probe('unrelated','read')).toEqual({before:false,after:false,visible:false});
 expect(await probe('telegram','read')).toEqual({before:true,after:true,visible:false});
});
test('Telegram Web browser-proof cookie stays bound to its embedded top-level site',async({page})=>{
 const {cookieHeader,loginCookieName}=await import('../../apps/api/src/session-cookie.ts');
 const probe=await embedCookieProbe(page,cookieHeader(loginCookieName(true),'C'.repeat(43),600,true));
 expect(await probe('telegram')).toEqual({before:false,after:true,visible:false});
 expect(await probe('unrelated','read')).toEqual({before:false,after:false,visible:false});
});
