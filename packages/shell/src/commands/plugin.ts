import { validatePluginPackage } from '@tuxos/sdk';
import type { CommandDefinition } from './types';

/** Uses the same lifecycle as the graphical manager; no independent filesystem-only installs. */
export function pluginCommand(): CommandDefinition {
  return {
    name: 'plugin', summary: 'Manage installed desktop plugins',
    usage: 'plugin list|info ID|install PACKAGE.json [--allow] [--replace]|enable ID --allow|disable ID|remove ID [--delete-data]',
    async run(ctx) {
      const plugins = ctx.shell.plugins;
      if (!plugins) { ctx.stderr('plugin: plugin management is available only in the learner’s system terminal.\n'); return 1; }
      const [operation = 'list', target, ...flags] = ctx.args;
      try {
        if (operation === 'list') {
          const entries = await plugins.list();
          ctx.stdout(entries.length ? entries.map((p) => `${p.id}\t${p.manifest?.version ?? 'unknown'}\t${p.status}\t${p.manifest?.name ?? 'Invalid package'}`).join('\n') + '\n' : 'No plugins installed. Open Plugins to browse the catalog.\n');
          return 0;
        }
        if (!target) throw new Error(`${operation}: a plugin ID or package path is required.`);
        if (flags.some((flag) => !['--allow', '--replace', '--delete-data'].includes(flag))) throw new Error('Unsupported option.');
        if (operation === 'info') {
          const entry = (await plugins.list()).find((p) => p.id === target);
          if (!entry) throw new Error('Plugin is not installed.');
          ctx.stdout(`${entry.manifest?.name ?? entry.id} (${entry.id})\nVersion: ${entry.manifest?.version ?? 'unknown'}\nStatus: ${entry.status}\nPermissions: ${entry.manifest?.capabilities.join(', ') || 'none'}\n${entry.error ?? entry.manifest?.description ?? ''}\n`);
        } else if (operation === 'install') {
          let raw = target;
          if (!target.startsWith('{')) {
            if (/^https?:/.test(target)) throw new Error('Download the package first, or import it through the Plugins app.');
            const read = ctx.dispatch<string>('fs.read', { path: ctx.resolve(target) });
            if (!read.ok) throw new Error(read.error.message);
            raw = read.value;
          }
          const pkg = validatePluginPackage(raw);
          if (pkg.manifest.capabilities.length && !flags.includes('--allow')) throw new Error(`Requested permissions: ${pkg.manifest.capabilities.join(', ')}. Review the package, then use --allow to approve private storage access.`);
          await plugins.install(pkg, { approvedCapabilities: flags.includes('--allow') ? pkg.manifest.capabilities : [], replace: flags.includes('--replace') });
          ctx.stdout(`Installed ${pkg.manifest.name} ${pkg.manifest.version}. Its apps are available immediately.\n`);
        } else if (operation === 'enable') {
          const pkg = await plugins.export(target);
          if (!flags.includes('--allow')) throw new Error('Review permissions in Plugins, or use --allow to enable this package.');
          await plugins.setEnabled(target, true, { approvedCapabilities: pkg.manifest.capabilities });
          ctx.stdout(`Enabled ${target}.\n`);
        } else if (operation === 'disable') {
          await plugins.setEnabled(target, false);
          ctx.stdout(`Disabled ${target}.\n`);
        } else if (operation === 'remove') {
          await plugins.uninstall(target, { deleteData: flags.includes('--delete-data') });
          ctx.stdout(`Removed ${target}.${flags.includes('--delete-data') ? ' Private data deleted.' : ' Private data kept for reinstall.'}\n`);
        } else throw new Error(`Unknown operation. Usage: ${this.usage}`);
        return 0;
      } catch (err) {
        ctx.stderr(`plugin: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    },
  };
}
