import { describe, it, expect } from 'vitest';
import { miniAppButton, inlineMainMenu, botStatus, botError } from '../src/bot-ui.js';
import { mainKeyboard } from '../src/telegram.js';
describe('AXON bot presentation',()=>{
  it('opens an inline Mini App at the canonical HTTPS origin',()=>{expect(miniAppButton('https://platform.example/','/connect')).toMatchObject({web_app:{url:'https://platform.example/#/connect'}});expect(miniAppButton('https://platform.example','//evil.example')).toMatchObject({web_app:{url:'https://platform.example/#/'}});});
  it('does not create unsafe WebApp buttons from missing or non-HTTPS config',()=>{expect(miniAppButton(undefined)).toBeNull();expect(miniAppButton('http://localhost:3001')).toBeNull();expect(miniAppButton('https://user:secret@example.com')).toBeNull();});
  it('replaces permanent quick keys with a compact inline application entry',()=>{expect(mainKeyboard).toEqual({remove_keyboard:true});const menu=JSON.stringify(inlineMainMenu('https://platform.example'));for(const action of ['n:buy','n:account','n:help','n:support','web_app'])expect(menu).toContain(action);expect(menu).not.toContain('login:link');expect((inlineMainMenu('https://platform.example') as unknown as {keyboard?:unknown}).keyboard).toBeUndefined();});
  it('uses understandable statuses and safe recovery text',()=>{expect(botStatus('COMPLETED')).toBe('Завершён');expect(botError('INVALID_BUTTON')).toContain('устарела');expect(botError('provider-secret')).not.toContain('provider-secret');});
});
