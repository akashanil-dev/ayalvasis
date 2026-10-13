import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSystem, type SystemClient } from '@tuxos/system';

const systems: SystemClient[] = [];
afterEach(async () => { for (const system of systems.splice(0)) await system.reset(); });
async function setup() {
  const data = new Map<string, string>();
  const system = createLocalSystem({ modules: [], storage: { get: async k => data.get(k) ?? null, set: async (k,v) => { data.set(k,v); }, remove: async k => { data.delete(k); } } });
  systems.push(system); await system.boot('ada');
  return { system, shell: await system.createTerminal() };
}
const packageJson = JSON.stringify({ format: 'tuxos-plugin', formatVersion: 1, manifest: {
  id: 'timer', name: 'Focus Timer', version: '1.2.0', description: 'Timer', capabilities: ['fs:read'],
  contributes: { apps: [{ id: 'timer-app', title: 'Timer', icon: '⏱' }], commands: [{ name: 'timer', summary: 'Launch timer' }] },
}, html: '<h1>Timer</h1>' });

describe('plugin terminal management', () => {
  it('reports an empty list and installs packages with reviewed permissions', async () => {
    const { system, shell } = await setup();
    expect((await shell.run('plugin list')).stdout).toContain('No plugins installed.');
    expect((await shell.run(`plugin install '${packageJson}'`)).stderr).toContain('--allow');
    expect((await shell.run(`plugin install '${packageJson}' --allow`)).code).toBe(0);
    expect((await system.apps()).some(app => app.id === 'timer-app')).toBe(true);
    expect((await shell.run('plugin info timer')).stdout).toContain('Focus Timer (timer)');
    expect((await shell.run('plugin list')).stdout).toContain('enabled');
    expect((await shell.run('timer')).code).toBe(0);
    expect((await shell.run('plugin disable timer')).code).toBe(0);
    expect((await shell.run('timer')).code).toBe(127);
    expect((await shell.run('plugin enable timer')).stderr).toContain('--allow');
    expect((await shell.run('plugin enable timer --allow')).code).toBe(0);
    expect((await shell.run('plugin remove timer')).code).toBe(0);
    expect(await system.apps()).toEqual([]);
    expect((await shell.run(`plugin install '${packageJson}' --allow`)).code).toBe(0);
  });

  it('imports a virtual file, refuses implicit fetches and never reports malformed installs as successful', async () => {
    const { system, shell } = await setup();
    await system.dispatch('fs.write', { path: '/home/ada/plugin.json', content: packageJson });
    expect((await shell.run('plugin install plugin.json --allow')).code).toBe(0);
    expect((await shell.run('plugin install https://example.test/plugin.json')).stderr).toContain('Download');
    expect((await shell.run("plugin install '{bad' --allow")).stderr).toContain('valid JSON');
    expect((await shell.run('plugin install missing.json')).code).toBe(1);
    expect((await shell.run('plugin remove ../../Documents')).code).toBe(1);
    expect((await shell.run('plugin remove timer --unknown')).code).toBe(1);
  });
});
