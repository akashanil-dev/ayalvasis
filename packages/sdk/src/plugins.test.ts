import { describe, expect, it } from 'vitest';
import { approvePlugin, comparePluginVersions, PLUGIN_LIMITS, validatePluginPackage } from './plugins';

const sample = () => ({ format: 'tuxos-plugin', formatVersion: 1, manifest: {
  id: 'sample', name: 'Sample', version: '1.0.0', description: 'An example.', capabilities: ['fs:read'],
  contributes: { apps: [{ id: 'sample-app', title: 'Sample', icon: '🧩' }] },
}, html: '<h1>Sample</h1>' });

describe('untrusted plugin packages', () => {
  it('normalizes JSON into supported fields without retaining arbitrary properties', () => {
    const value = { ...sample(), secret: 'ignored', manifest: { ...sample().manifest, requires: ['kernel'], code: 'ignored' } };
    const pkg = validatePluginPackage(JSON.stringify(value));
    expect(pkg.manifest.entry).toBe('index.html');
    expect(pkg).not.toHaveProperty('secret');
    expect(pkg.manifest).not.toHaveProperty('requires');
  });
  it.each(['../escape', 'foo/bar', '__proto__', 'constructor', 'prototype', 'a'.repeat(49), 'Bad', ''])('rejects unsafe IDs: %s', (id) => {
    const value = sample(); value.manifest.id = id;
    expect(() => validatePluginPackage(value)).toThrow();
  });
  it.each(['*', 'fs:*', 'user:switch', 'shell:exec', 'session:control', 'lessons:write'])('rejects unsupported authority: %s', (capability) => {
    const value = sample(); value.manifest.capabilities = [capability];
    expect(() => validatePluginPackage(value)).toThrow('permission');
  });
  it.each([null, [], {}, 'no json', { ...sample(), formatVersion: 2 }, { ...sample(), html: '' }])('rejects malformed packages', (value) => {
    expect(() => validatePluginPackage(value)).toThrow();
  });
  it.each(['../index.html', '/index.html', 'https://example.test/a.html', 'install.json'])('rejects unsafe entry files: %s', (entry) => {
    expect(() => validatePluginPackage({ ...sample(), manifest: { ...sample().manifest, entry } })).toThrow('Entry');
  });
  it('rejects duplicate apps, invalid versions, oversized data and unapproved permissions', () => {
    const value = sample();
    value.manifest.contributes.apps.push(value.manifest.contributes.apps[0]!);
    expect(() => validatePluginPackage(value)).toThrow('Duplicate app');
    expect(() => validatePluginPackage({ ...sample(), manifest: { ...sample().manifest, version: '01.0.0' } })).toThrow('Version');
    expect(() => validatePluginPackage({ ...sample(), html: 'x'.repeat(PLUGIN_LIMITS.packageBytes) })).toThrow('256 KB');
    expect(() => validatePluginPackage({ ...sample(), html: '🔥'.repeat(70_000) })).toThrow('256 KB');
    const manifest = validatePluginPackage(sample()).manifest;
    expect(() => approvePlugin(manifest, { approvedCapabilities: [] })).toThrow('approve');
    expect(() => approvePlugin(manifest, { approvedCapabilities: ['fs:read'] })).not.toThrow();
  });
  it('compares numeric version segments', () => {
    expect(comparePluginVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(comparePluginVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(comparePluginVersions('1.0.0', '1.0.0')).toBe(0);
  });
});
