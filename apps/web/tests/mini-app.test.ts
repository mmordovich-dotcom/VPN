import { describe, it, expect, vi } from 'vitest';
import { MiniAppBridge, type TelegramApp } from '../src/mini-app.js';
function fixture(active=true) {
  const values=new Map<string,string>();
  const root={dataset:{} as Record<string,string>,style:{setProperty:(key:string,value:string)=>values.set(key,value)}} as unknown as HTMLElement;
  const listeners=new Map<string,()=>void>(); const navigate=vi.fn();
  const app:TelegramApp={initData:active?'signed-server-fixture':'',colorScheme:'dark',viewportStableHeight:740,ready:vi.fn(),expand:vi.fn(),setHeaderColor:vi.fn(),setBackgroundColor:vi.fn(),setBottomBarColor:vi.fn(),onEvent:(key,fn)=>{listeners.set(key,fn);},offEvent:vi.fn(),BackButton:{show:vi.fn(),hide:vi.fn(),onClick:vi.fn(),offClick:vi.fn()},SettingsButton:{show:vi.fn(),hide:vi.fn(),onClick:vi.fn(),offClick:vi.fn()},HapticFeedback:{selectionChanged:vi.fn(),notificationOccurred:vi.fn()}};
  return {app,root,values,listeners,navigate,bridge:new MiniAppBridge(app,root,navigate)};
}
describe('optional Telegram WebApp bridge',()=>{
  it('leaves ordinary browser navigation and theme alone',()=>{const f=fixture(false);f.bridge.start();f.bridge.route('/orders');f.bridge.feedback('success');expect(f.root.dataset.miniApp).toBeUndefined();expect(f.app.ready).not.toHaveBeenCalled();expect(f.app.BackButton?.show).not.toHaveBeenCalled();});
  it('supports an absent SDK',()=>{const f=fixture();expect(()=>{const b=new MiniAppBridge(undefined,f.root,f.navigate);b.start();b.route('/');b.destroy();}).not.toThrow();});
  it('signals ready and expand for an active Mini App',()=>{const f=fixture();f.bridge.start();expect(f.app.ready).toHaveBeenCalledOnce();expect(f.app.expand).toHaveBeenCalledOnce();expect(f.root.dataset.miniApp).toBe('true');});
  it('combines safe areas and uses a stable viewport height',()=>{const f=fixture();f.app.safeAreaInset={top:20,bottom:12,left:0,right:0};f.app.contentSafeAreaInset={top:40,bottom:4,left:0,right:0};f.bridge.start();expect(f.values.get('--tg-safe-top')).toBe('60px');expect(f.values.get('--tg-safe-bottom')).toBe('16px');expect(f.values.get('--tg-height')).toBe('740px');});
  it('tracks Telegram theme changes',()=>{const f=fixture();f.bridge.start();f.app.colorScheme='light';f.listeners.get('themeChanged')!();expect(f.root.dataset.theme).toBe('light');expect(f.app.setBackgroundColor).toHaveBeenLastCalledWith('#f4f4f2');});
  it('makes native Back return to the dashboard, with root hidden',()=>{const f=fixture();f.bridge.start();f.bridge.route('/orders');expect(f.app.BackButton?.show).toHaveBeenCalled();(f.app.BackButton!.onClick as ReturnType<typeof vi.fn>).mock.calls[0]![0]();expect(f.navigate).toHaveBeenCalledWith('/');f.bridge.route('/');expect(f.app.BackButton?.hide).toHaveBeenCalled();});
  it('uses explicit haptics and removes native event handlers',()=>{const f=fixture();f.bridge.start();f.bridge.feedback('selection');f.bridge.feedback('success');expect(f.app.HapticFeedback?.selectionChanged).toHaveBeenCalledOnce();expect(f.app.HapticFeedback?.notificationOccurred).toHaveBeenCalledWith('success');f.bridge.destroy();expect(f.app.offEvent).toHaveBeenCalledTimes(4);expect(f.app.BackButton?.offClick).toHaveBeenCalled();expect(f.app.SettingsButton?.hide).toHaveBeenCalled();});
  it('tolerates unsupported capabilities without breaking the page',()=>{const f=fixture();f.app.ready=()=>{throw Error('old client');};f.app.setHeaderColor=()=>{throw Error('unsupported');};expect(()=>{f.bridge.start();f.bridge.route('/');f.bridge.feedback('error');}).not.toThrow();});
});
