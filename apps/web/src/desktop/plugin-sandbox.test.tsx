import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createLocalSystem, type SystemClient } from '@tuxos/system';
import { PluginWindowFrame } from './PluginWindowFrame';
import { createPluginDocument, PLUGIN_CSP } from './plugin-document';

let system: SystemClient;
afterEach(async () => { cleanup(); await system?.reset(); });

describe('plugin iframe host', () => {
  it('resolves package ownership and custom entry files under StrictMode, enforcing sandbox and CSP', async () => {
    const values = new Map<string,string>();
    system = createLocalSystem({ modules: [], storage: { get: async k => values.get(k) ?? null, set: async(k,v)=>{values.set(k,v);}, remove: async k=>{values.delete(k);} } });
    await system.boot('ada');
    await system.plugins!().install({ format: 'tuxos-plugin', formatVersion: 1, manifest: { id: 'calculator-package', name: 'Calculator', version: '1.0.0', capabilities: [], entry: 'calculator.html', contributes: { apps: [{ id: 'calculator-app', title: 'Calculator', icon: 'x' }] } }, html: '<h1>Calculator content</h1>' }, { approvedCapabilities: [] });
    const opened = await system.openApp('calculator-app');
    if (!opened.ok) throw new Error('could not open');
    render(<StrictMode><PluginWindowFrame system={system} windowId={opened.value} /></StrictMode>);
    const iframe = await screen.findByTitle('Plugin: Calculator') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.srcdoc).toContain('Calculator content');
    expect(iframe.srcdoc).toContain(PLUGIN_CSP);
    expect(iframe.srcdoc).toContain('event.source !== parent');
    fireEvent.load(iframe);
    fireEvent.load(iframe);
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('places policy and SDK before authored scripts and strips refresh/base overrides', () => {
    const html = createPluginDocument('<HEAD><meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test"></HEAD><body><script>window.test=true;</script><h1>Safe content</h1></body>', 'channel');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelectorAll('meta[http-equiv]')).toHaveLength(1);
    expect(parsed.querySelector('base')).toBeNull();
    expect(parsed.querySelector('meta[http-equiv]')?.getAttribute('content')).toBe(PLUGIN_CSP);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('window.test'));
    expect(html.indexOf('Object.defineProperty')).toBeLessThan(html.indexOf('window.test'));
  });
});
