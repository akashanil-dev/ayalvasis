import type { ModuleDefinition, ModuleManifest } from '@ayalvasis/sdk';
import { describe, expect, it } from 'vitest';
import { createKernel } from '@ayalvasis/kernel';
import { createShell } from '@ayalvasis/shell';
import { createModuleHost } from './index';
import { failing } from './fixtures/failing';
import { hello } from './fixtures/hello';
import { missingCommand } from './fixtures/missing-command';
import { notes } from './fixtures/notes';
import { partialFailure } from './fixtures/partial-failure';

function setup() {
  const kernel = createKernel({ username: 'ada' });
  const shell = createShell(kernel);
  return { kernel, shell, host: createModuleHost({ kernel, shell }) };
}

function manifest(id: string, changes: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id, version: '1.0.0', title: id, capabilities: [], activation: [], contributes: {}, ...changes,
  };
}

function moduleDefinition(value: ModuleManifest, activate: ModuleDefinition['activate'] = () => {}): ModuleDefinition {
  return { manifest: value, activate };
}

describe('module validation', () => {
  it.each(['Bad', '1bad', 'bad_name', ''])('rejects invalid module id %j', (id) => {
    const { host } = setup();
    expect(() => host.add(manifest(id), async () => moduleDefinition(manifest(id)))).toThrow('module id');
  });

  it.each(['1.0', 'v1.0.0', '1.0.0-beta', '1.0.0.0'])('rejects invalid version %j', (version) => {
    const { host } = setup();
    const value = manifest('bad-version', { version });
    expect(() => host.add(value, async () => moduleDefinition(value))).toThrow('version');
  });

  it('rejects duplicate modules, claims and built-in clashes', () => {
    const { host } = setup();
    const first = manifest('first', {
      contributes: { commands: [{ name: 'thing', summary: 'x' }], apps: [{ id: 'desk', title: 'Desk', icon: 'x' }] },
    });
    host.add(first, async () => moduleDefinition(first));
    expect(() => host.add(first, async () => moduleDefinition(first))).toThrow('duplicate module');
    expect(() => host.add(manifest('second', {
      contributes: { commands: [{ name: 'thing', summary: 'x' }] },
    }), async () => moduleDefinition(manifest('second')))).toThrow('command already claimed');
    expect(() => host.add(manifest('third', {
      contributes: { apps: [{ id: 'desk', title: 'Desk', icon: 'x' }] },
    }), async () => moduleDefinition(manifest('third')))).toThrow('app already claimed');
    expect(() => host.add(manifest('fourth', {
      contributes: { commands: [{ name: 'ls', summary: 'x' }] },
    }), async () => moduleDefinition(manifest('fourth')))).toThrow('built-in');
  });

  it('rejects duplicate contributions and malformed capabilities', () => {
    const { host } = setup();
    expect(() => host.add(manifest('duplicate', {
      contributes: { commands: [{ name: 'x', summary: '' }, { name: 'x', summary: '' }] },
    }), async () => moduleDefinition(manifest('duplicate')))).toThrow('duplicate command');
    for (const capability of ['FS:read', 'fs', 'fs:', 'fs:Read', 'fs:read:more']) {
      const value = manifest(`cap-${capability.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, {
        capabilities: [capability],
      });
      expect(() => host.add(value, async () => moduleDefinition(value))).toThrow('capability');
    }
  });

  it('allows an app and command to share an id', () => {
    const { host } = setup();
    const value = manifest('about-module', {
      contributes: {
        apps: [{ id: 'about', title: 'About', icon: 'info' }],
        commands: [{ name: 'about', summary: 'About this system' }],
      },
    });
    expect(() => host.add(value, async () => moduleDefinition(value))).not.toThrow();
  });
});

describe('lazy activation and commands', () => {
  it('does not load until a contributed command runs', async () => {
    const { host, shell } = setup();
    let loads = 0;
    host.add(hello.manifest, async () => { loads += 1; return hello; });
    expect(loads).toBe(0);
    const result = await shell.run('hello');
    expect(result).toEqual({ stdout: 'hello from a module\n', stderr: '', code: 0 });
    expect(loads).toBe(1);
    expect(host.status('hello')).toBe('active');
    await shell.run('hello');
    expect(loads).toBe(1);
  });

  it('reports activation failure and missing registrations through the stub', async () => {
    const first = setup();
    first.host.add(failing.manifest, async () => failing);
    await first.host.start();
    expect(first.host.status('failing')).toBe('failed');
    const broken = manifest('broken', {
      contributes: { commands: [{ name: 'broken', summary: 'Broken command' }] },
      activation: ['onCommand:broken'],
    });
    first.host.add(broken, async () => moduleDefinition(broken, () => { throw new Error('no loader'); }));
    const failureResult = await first.shell.run('broken');
    expect(failureResult.stderr).toContain("broken: module 'broken' failed to load: no loader");

    const second = setup();
    second.host.add(missingCommand.manifest, async () => missingCommand);
    const result = await second.shell.run('missing');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing: module 'missing-command' did not provide this command");
  });
});

describe('dependencies and failures', () => {
  it('activates dependencies first and shares concurrent activation', async () => {
    const { host } = setup();
    const order: string[] = [];
    const a = manifest('a', { activation: ['onStartup'] });
    const b = manifest('b', { requires: ['a'], activation: ['onStartup'] });
    let loads = 0;
    host.add(a, async () => moduleDefinition(a, () => { order.push('a'); }));
    host.add(b, async () => {
      loads += 1;
      await Promise.resolve();
      return moduleDefinition(b, () => { order.push('b'); });
    });
    await Promise.all([host.activate('b'), host.activate('b')]);
    expect(order).toEqual(['a', 'b']);
    expect(loads).toBe(1);
  });

  it('fails cycles and missing dependencies with a named chain', async () => {
    const cycle = setup();
    const a = manifest('cycle-a', { requires: ['cycle-b'] });
    const b = manifest('cycle-b', { requires: ['cycle-a'] });
    cycle.host.add(a, async () => moduleDefinition(a));
    cycle.host.add(b, async () => moduleDefinition(b));
    await expect(cycle.host.activate('cycle-a')).rejects.toThrow('cycle-a -> cycle-b -> cycle-a');
    expect(cycle.host.status('cycle-a')).toBe('failed');

    const missing = setup();
    const child = manifest('child', { requires: ['not-registered'] });
    missing.host.add(child, async () => moduleDefinition(child));
    await expect(missing.host.activate('child')).rejects.toThrow('child -> not-registered');
  });

  it('isolates failures and emits activated and failed events', async () => {
    const { host } = setup();
    const events: string[] = [];
    host.on((event) => events.push(event.type + ':' + event.id));
    host.add(failing.manifest, async () => failing);
    host.add(hello.manifest, async () => hello);
    await host.start();
    expect(host.status('failing')).toBe('failed');
    expect(host.status('hello')).toBe('registered');
    await host.activate('hello');
    expect(events).toEqual(['failed:failing', 'activated:hello']);
  });

  it('cleans up actions and grants after partial activation failure', async () => {
    const { host, kernel } = setup();
    host.add(partialFailure.manifest, async () => partialFailure);
    await expect(host.activate('partial-failure')).rejects.toThrow('partial activation failed');
    expect(kernel.dispatch({ type: 'partial-failure.read', payload: {} })).toMatchObject({
      ok: false, error: { code: 'ENOSYS' },
    });
    expect(kernel.dispatch(
      { type: 'fs.read', payload: { path: '/etc/hostname' } },
      { actor: { kind: 'module', id: 'partial-failure' } },
    )).toMatchObject({ ok: false, error: { code: 'EPERM' } });
  });
});

describe('module context', () => {
  it('grants exactly declared capabilities and enforces them', async () => {
    const { host, kernel } = setup();
    const value = manifest('reader', { capabilities: ['fs:read'] });
    let result: unknown;
    host.add(value, async () => moduleDefinition(value, (ctx) => {
      result = ctx.dispatch('fs.write', { path: '/home/ada/nope', content: 'x' });
    }));
    await host.activate('reader');
    expect(result).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    expect(kernel.can({ kind: 'module', id: 'reader' }, 'fs:write')).toBe(false);
  });

  it('binds action filesystem helpers to the acting Linux user', async () => {
    const { host, kernel } = setup();
    const value = manifest('writer', { capabilities: ['fs:write'] });
    host.add(value, async () => moduleDefinition(value, (ctx) => {
      ctx.registerAction({
        type: 'writer.write', capability: 'fs:write', description: 'Write a path', mutates: true,
        run: ({ fs }, payload) => fs.write(
          (payload as { path: string }).path, 'written',
        ),
      });
    }));
    await host.activate('writer');
    const actor = { kind: 'module' as const, id: 'writer' };
    expect(kernel.dispatch(
      { type: 'writer.write', payload: { path: '/etc/module-file' } }, { actor },
    )).toMatchObject({ ok: false, error: { code: 'EACCES' } });
    expect(kernel.dispatch(
      { type: 'writer.write', payload: { path: '/etc/module-file' } }, { actor, user: 'root' },
    )).toMatchObject({ ok: true });
  });

  it('rejects actions and commands outside the manifest', async () => {
    const { host } = setup();
    const actionManifest = manifest('actions');
    host.add(actionManifest, async () => moduleDefinition(actionManifest, (ctx) => {
      ctx.registerAction({
        type: 'other.action', capability: 'fs:read', description: '', mutates: false, run: () => undefined,
      });
    }));
    await expect(host.activate('actions')).rejects.toThrow("must start with 'actions.'");

    const commandManifest = manifest('commands', {
      contributes: { commands: [{ name: 'declared', summary: '' }] },
    });
    host.add(commandManifest, async () => moduleDefinition(commandManifest, (ctx) => {
      ctx.registerCommand({ name: 'other', summary: '', usage: 'other', run: () => 0 });
    }));
    await expect(host.activate('commands')).rejects.toThrow('undeclared command');
  });

  it('lists apps, opens their module, and activates required modules', async () => {
    const { host, kernel } = setup();
    host.add(hello.manifest, async () => hello);
    host.add(notes.manifest, async () => notes);
    expect(host.apps()).toEqual([{ ...notes.manifest.contributes.apps![0], moduleId: 'notes' }]);
    await host.openApp('notes');
    expect(host.status('hello')).toBe('active');
    expect(kernel.dispatch(
      { type: 'notes.add', payload: { text: 'first' } },
      { actor: { kind: 'module', id: 'notes' } },
    )).toMatchObject({ ok: true });
    expect(kernel.dispatch({ type: 'fs.read', payload: { path: '/home/ada/notes.txt' } }))
      .toEqual({ ok: true, value: 'first\n' });
  });

  it('keeps two hosts independent', async () => {
    const one = setup();
    const two = setup();
    let oneLoads = 0;
    let twoLoads = 0;
    one.host.add(hello.manifest, async () => { oneLoads += 1; return hello; });
    two.host.add(hello.manifest, async () => { twoLoads += 1; return hello; });
    await one.shell.run('hello');
    expect(oneLoads).toBe(1);
    expect(twoLoads).toBe(0);
    expect(two.host.status('hello')).toBe('registered');
  });
});
