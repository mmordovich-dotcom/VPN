import { describe, it, expect } from 'vitest';
import { miniAppButton, inlineMainMenu, botStatus, botError } from '../src/bot-ui.js';
import { mainKeyboard } from '../src/telegram.js';
describe('AXON bot presentation',()=>{
  it('opens an inline Mini App at the canonical HTTPS origin',()=>{expect(miniAppButton('https://platform.example/','/connect')).toMatchObject({web_app:{url:'https://platform.example/#/connect'}});expect(miniAppButton('https://platform.example','//evil.example')).toMatchObject({web_app:{url:'https://platform.example/#/'}});});
  it('does not create unsafe WebApp buttons from missing or non-HTTPS config',()=>{expect(miniAppButton(undefined)).toBeNull();expect(miniAppButton('http://localhost:3001')).toBeNull();expect(miniAppButton('https://user:secret@example.com')).toBeNull();});
  it('keeps all quick actions and both login methods next to the application entry',()=>{const keyboard=JSON.stringify(mainKeyboard);for(const text of ['Купить подписку','Моя подписка','Подключиться','Продлить подписку','Инструкции','Поддержка','Личный кабинет','Получить код входа','Открыть приложение'])expect(keyboard).toContain(text);const menu=JSON.stringify(inlineMainMenu('https://platform.example'));for(const action of ['buy','renew','connect','support','notifications','login:link','login:code'])expect(menu).toContain(action);expect(menu).toContain('web_app');});
  it('uses understandable statuses and safe recovery text',()=>{expect(botStatus('COMPLETED')).toBe('Завершён');expect(botError('INVALID_BUTTON')).toContain('устарела');expect(botError('provider-secret')).not.toContain('provider-secret');});
});
