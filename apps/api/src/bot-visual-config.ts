/** Presentation assets and emoji choices only. Never store subscriptions or Telegram credentials here. */
export type BotSection = 'main'|'catalog'|'profile'|'instructions'|'support';
export type EmojiKey = 'connect'|'profile'|'subscription'|'instructions'|'support'|'success'|'warning'|'app';
export type BotVisualConfig = {
  mediaEnabled:boolean;
  banners:Record<BotSection,{path:string;revision:string}>;
  emoji:{enabled:boolean;setName:string;ids:Partial<Record<EmojiKey,string>>};
};
const banner={path:'/assets/bot/axon-banner-v1.png',revision:'1'};
export const botVisualConfig:BotVisualConfig={
  mediaEnabled:true,
  banners:{main:banner,catalog:banner,profile:banner,instructions:banner,support:banner},
  // Resolve actual IDs from this owner-selected set through Telegram. No fabricated IDs.
  emoji:{enabled:true,setName:'IslomjonAnimeEmoji',ids:{}},
};
/** Explicit legacy text-channel fixture; new media tests exercise the production policy. */
export const textOnlyBotVisuals:BotVisualConfig={...botVisualConfig,mediaEnabled:false,emoji:{...botVisualConfig.emoji,enabled:false}};
