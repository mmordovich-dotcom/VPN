import {createHash} from 'node:crypto';
import type {BotButton} from './bot-ui.js';
import {botVisualConfig,type BotSection,type BotVisualConfig,type EmojiKey} from './bot-visual-config.js';
export type BotReply={method:string;body:Record<string,unknown>;removeKeyboard?:boolean;section?:BotSection;presentation?:1;asset?:string;fallback?:{method:string;body:Record<string,unknown>}};
export type PhotoSource={photoFileId?:string;captionDigest?:string;captionEntitiesDigest?:string};
export type BotEntity={type:'bold'|'custom_emoji';offset:number;length:number;custom_emoji_id?:string};
export const unicodeEmoji:Record<EmojiKey,string>={connect:'⚡',profile:'👤',subscription:'📦',instructions:'📖',support:'💬',success:'✅',warning:'⚠️',app:'✨'};
const alternatives:Record<EmojiKey,string[]>={connect:['⚡','⚡️'],profile:['👤','👥'],subscription:['📦','💳','🎟️','💎'],instructions:['📖','📚','📕','📘'],support:['💬','✉️','📩'],success:['✅','✔️','☑️'],warning:['⚠️','❗','❕'],app:['✨','⭐','🌟']};
const titles:Record<BotSection,string>={main:'Главное меню',catalog:'Выбор подписки',profile:'Личный кабинет',instructions:'Инструкции',support:'Поддержка'};
const sectionEmoji:Record<BotSection,EmojiKey>={main:'app',catalog:'subscription',profile:'profile',instructions:'instructions',support:'support'};
const idPattern=/^[1-9][0-9]{5,23}$/;
const normalEmoji=(s:string)=>s.replace(/️/g,'');
export const presentationDigest=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value??[])).digest('hex');
export function sectionForAction(raw:string):BotSection|undefined{
 const s=raw.replace(/^[no]:/,'');
 if(s.startsWith('/start')||['menu','/menu'].includes(s))return 'main';
 if(['buy','/buy','🛒 Купить подписку'].includes(s)||s.startsWith('catalog:'))return 'catalog';
 if(['account','/profile'].includes(s))return 'profile';
 if(['help','/help','/instructions','📖 Инструкции'].includes(s))return 'instructions';
 if(['support','/support','💬 Поддержка'].includes(s)||s.startsWith('support:list:'))return 'support';
 return undefined;
}
export function bannerUrl(origin:string|undefined,section:BotSection,policy:BotVisualConfig=botVisualConfig){
 try{const u=new URL(origin??'');const a=policy.banners[section];
  if(u.protocol!=='https:'||u.username||u.password||!/^\/assets\/bot\/[A-Za-z0-9_-]+\.(png|jpg|jpeg)$/.test(a.path)||!/^[-A-Za-z0-9_.]{1,64}$/.test(a.revision))return null;
  return u.origin+a.path+'?v='+encodeURIComponent(a.revision);
 }catch{return null;}
}
const escapeHtml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Use only an ID returned by the validated Telegram resolver below. Buttons never use HTML. */
export function emojiHtml(emoji:string,verifiedId:string|undefined){return verifiedId&&idPattern.test(verifiedId)?'<tg-emoji emoji-id="'+verifiedId+'">'+escapeHtml(emoji)+'</tg-emoji>':escapeHtml(emoji);}
function plainHtml(text:string){return text.replace(/<\/?(?:tg-emoji(?:\s+emoji-id="[0-9]+")?|b)>/g,'').replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');}
function buttonKey(button:BotButton):EmojiKey|undefined{
 const d=button.callback_data?.replace(/^[no]:/,'');
 if(d==='buy'||d==='/buy')return 'connect';if(d==='account')return 'profile';if(d==='help')return 'instructions';if(d==='support')return 'support';if(d==='subscription')return 'subscription';if(button.web_app||d==='app')return 'app';return undefined;
}
export function plainPresentationBody(body:Record<string,unknown>):Record<string,unknown>{
 const {entities:_entities,caption_entities:_captions,parse_mode:mode,...out}=body;
 if(mode==='HTML')for(const key of ['text','caption'])if(typeof out[key]==='string')out[key]=plainHtml(out[key] as string);
 const markup=out.reply_markup as {inline_keyboard?:BotButton[][]}|undefined;
 if(markup?.inline_keyboard)out.reply_markup={inline_keyboard:markup.inline_keyboard.map(row=>row.map(({icon_custom_emoji_id:icon,style:_style,...button})=>{
  const key=buttonKey(button);const prefix=key==='app'?'✦':key?unicodeEmoji[key]:'';
  return {...button,text:icon&&prefix&&!button.text.startsWith(prefix)?prefix+' '+button.text:button.text};
 }))};
 if(out.media&&typeof out.media==='object')out.media=plainPresentationBody(out.media as Record<string,unknown>);
 return out;
}
export function hasCustomEmoji(body:Record<string,unknown>):boolean{return JSON.stringify(body).includes('custom_emoji');}
export function hasOptionalFormatting(body:Record<string,unknown>):boolean{return Boolean(body.entities||body.caption_entities||body.parse_mode||JSON.stringify(body.reply_markup??{}).includes('icon_custom_emoji_id')||body.media&&hasOptionalFormatting(body.media as Record<string,unknown>));}
export class BotPresentation{
 private fileIds=new Map<string,string>();private emojiIds:Partial<Record<EmojiKey,string>>={};private emojiFallback:Partial<Record<EmojiKey,string>>={};private emojiLoad:Promise<void>|undefined;private emojiDisabled=false;
 constructor(private origin:string|undefined,private call:(method:string,body:Record<string,unknown>)=>Promise<unknown>,private policy:BotVisualConfig=botVisualConfig){}
 disableEmoji(){this.emojiDisabled=true;this.emojiIds={};}
 async loadEmoji(){
  if(!this.policy.emoji.enabled||this.emojiDisabled)return;
  this.emojiLoad??=this.resolveEmoji().catch(()=>{this.emojiIds={};this.emojiFallback={};});
  await this.emojiLoad;
 }
 private async resolveEmoji(){
  type Sticker={type?:string;emoji?:string;custom_emoji_id?:string};
  let stickers:Sticker[]=[];
  if(/^[A-Za-z0-9_]{1,64}$/.test(this.policy.emoji.setName)){
   try{const set=await this.call('getStickerSet',{name:this.policy.emoji.setName}) as {sticker_type?:string;stickers?:Sticker[]};if(set?.sticker_type==='custom_emoji'&&Array.isArray(set.stickers))stickers=set.stickers;}catch{/* Optional cosmetics must not block webhook, login or delivery. */}
  }
  const overrides=Object.entries(this.policy.emoji.ids).filter(([,id])=>typeof id==='string'&&idPattern.test(id));
  let verified:Sticker[]=[];
  if(overrides.length)try{const result=await this.call('getCustomEmojiStickers',{custom_emoji_ids:[...new Set(overrides.map(([,id])=>id))]});if(Array.isArray(result))verified=result;}catch{/* Use valid set choices or Unicode. */}
  for(const key of Object.keys(unicodeEmoji) as EmojiKey[]){
   const explicit=this.policy.emoji.ids[key];
   const valid=(s:Sticker)=>s.type==='custom_emoji'&&typeof s.custom_emoji_id==='string'&&idPattern.test(s.custom_emoji_id)&&typeof s.emoji==='string'&&alternatives[key].some(e=>normalEmoji(e)===normalEmoji(s.emoji!));
   const sticker=explicit?verified.find(s=>s.type==='custom_emoji'&&s.custom_emoji_id===explicit&&typeof s.emoji==='string'&&s.emoji.length>0&&s.emoji.length<=32):stickers.find(valid);
   if(sticker?.custom_emoji_id&&sticker.emoji){this.emojiIds[key]=sticker.custom_emoji_id;this.emojiFallback[key]=sticker.emoji;}
  }
 }
 private markup(value:unknown){
  const markup=value as {inline_keyboard?:BotButton[][]}|undefined;
  if(!markup?.inline_keyboard)return value;
  return {inline_keyboard:markup.inline_keyboard.map(row=>row.map(button=>{
   const key=buttonKey(button);const id=key?this.emojiIds[key]:undefined;
   if(!id)return button;
   const label=button.text.replace(/^(?:⚡️?|👤|📦|📖|💬|📱|✨|✦)\s*/u,'');
   return {...button,text:label,icon_custom_emoji_id:id};
  }))};
 }
 private caption(section:BotSection,text:string){
  const key=sectionEmoji[section];const emoji=this.emojiFallback[key]??unicodeEmoji[key];
  const old=text.split('\n')[0]??'';
  const removable=/^(?:AXON(?: · Главное меню)?|Личный кабинет AXON|Выберите подписку AXON|Инструкции AXON|Поддержка)$/u.test(old);
  const detail=removable?text.slice(old.length).trimStart():text;
  const title='AXON · '+titles[section];const caption=emoji+' '+title+'\n\n'+detail;
  const entities:BotEntity[]=[{type:'bold',offset:emoji.length+1,length:title.length}];
  const id=this.emojiIds[key];if(id)entities.unshift({type:'custom_emoji',offset:0,length:emoji.length,custom_emoji_id:id});
  return {caption,entities};
 }
 async prepare(reply:BotReply,source:PhotoSource={}):Promise<BotReply>{
  if(reply.presentation)return reply;
  const text=reply.body.text;
  if(typeof text!=='string')return {...reply,presentation:1};
  const id=reply.body.message_id;const editing=reply.method==='editMessageText';
  const asset=reply.section&&this.policy.mediaEnabled?bannerUrl(this.origin,reply.section,this.policy):null;
  if(asset&&reply.section){
   await this.loadEmoji();const caption=this.caption(reply.section,text);
   if(caption.caption.length<=1024){
    const markup=this.markup(reply.body.reply_markup);
    const common={chat_id:reply.body.chat_id,reply_markup:markup};
    const fallback={method:editing&&!source.photoFileId?'editMessageText':'sendMessage',body:{...common,...(editing&&!source.photoFileId?{message_id:id}:{}),text:caption.caption,entities:caption.entities,link_preview_options:{is_disabled:true}}};
    const photo=this.fileIds.get(asset)??asset;
    if(editing){
     const same=source.photoFileId&&source.photoFileId===this.fileIds.get(asset);
     if(same&&source.captionDigest===presentationDigest(caption.caption)&&source.captionEntitiesDigest===presentationDigest(caption.entities))return {...reply,presentation:1,asset,fallback,method:'editMessageReplyMarkup',body:{...common,message_id:id}};
     if(same)return {...reply,presentation:1,asset,fallback,method:'editMessageCaption',body:{...common,message_id:id,caption:caption.caption,caption_entities:caption.entities}};
     return {...reply,presentation:1,asset,fallback,method:'editMessageMedia',body:{...common,message_id:id,media:{type:'photo',media:photo,caption:caption.caption,caption_entities:caption.entities}}};
    }
    return {...reply,presentation:1,asset,fallback,method:'sendPhoto',body:{...common,photo,caption:caption.caption,caption_entities:caption.entities}};
   }
  }
  // A long support message or technical reply is never truncated to fit a photo.
  if(editing&&source.photoFileId){
   const {text:_text,link_preview_options:_preview,...body}=reply.body;
   const {message_id:_id,...fresh}=reply.body;
   const fallback={method:'sendMessage',body:fresh};
   if(text.length<=1024)return {...reply,presentation:1,fallback,method:'editMessageCaption',body:{...body,caption:text}};
   return {...reply,presentation:1,method:'sendMessage',body:fresh};
  }
  return {...reply,presentation:1};
 }
 remember(reply:BotReply,result:unknown){
  if(!reply.asset||!result||typeof result!=='object')return;
  const photo=(result as {photo?:{file_id?:string}[]}).photo;
  const id=Array.isArray(photo)?photo.at(-1)?.file_id:undefined;
  if(typeof id==='string'&&id.length<=512)this.fileIds.set(reply.asset,id);
 }
 forget(asset:string){this.fileIds.delete(asset);}
 uncached(reply:BotReply):BotReply|undefined{
  if(!reply.asset)return;
  if(reply.method==='sendPhoto'&&reply.body.photo!==reply.asset)return {...reply,body:{...reply.body,photo:reply.asset}};
  const media=reply.body.media as Record<string,unknown>|undefined;
  if(reply.method==='editMessageMedia'&&media?.media!==reply.asset)return {...reply,body:{...reply.body,media:{...media,media:reply.asset}}};
 }
 fresh(reply:BotReply):BotReply{
  const {message_id:_id,...body}=reply.body;
  if(reply.asset){
   const media=body.media as Record<string,unknown>|undefined;
   const caption=media?.caption??body.caption??reply.fallback?.body.text;
   const entities=media?.caption_entities??body.caption_entities??reply.fallback?.body.entities;
   return {...reply,method:'sendPhoto',body:{chat_id:body.chat_id,photo:this.fileIds.get(reply.asset)??reply.asset,caption,caption_entities:entities,reply_markup:body.reply_markup}};
  }
  return reply.fallback?{...reply,method:reply.fallback.method,body:reply.fallback.body}:{...reply,method:'sendMessage',body};
 }
}
