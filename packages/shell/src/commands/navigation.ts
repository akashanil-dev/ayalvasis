import type { CommandDefinition } from './types';
import { invalidOption, modeString, options, stat, strerror, type Stat } from './helpers';

export function navigationCommands(): CommandDefinition[] {
  return [
    {
      name: 'cd',
      summary: 'Change the shell working directory',
      usage: 'cd [DIR]',
      run(ctx) {
        const parsed = options(ctx);
        if (parsed.unknown) return invalidOption(ctx, 'cd', `-${parsed.unknown}`, 1, true);
        const args = parsed.args;
        const previous = ctx.shell.cwd;
        const target = args[0] === '-'
          ? ctx.shell.env.OLDPWD || ctx.shell.cwd
          : args[0] || ctx.shell.env.HOME;
        const path = ctx.resolve(target!);
        const result = stat(ctx, path);
        if (!result.ok) {
          ctx.stderr(`bash: cd: ${args[0] ?? target}: ${strerror(result.error.code)}\n`);
          return 1;
        }
        if (result.value.kind !== 'dir') {
          ctx.stderr(`bash: cd: ${args[0]}: Not a directory\n`);
          return 1;
        }
        ctx.shell.env.OLDPWD = previous;
        ctx.shell.cwd = path;
        ctx.shell.env.PWD = path;
        if (args[0] === '-') ctx.stdout(`${path}\n`);
        return 0;
      },
    },
    {
      name: 'pwd',
      summary: 'Print the working directory',
      usage: 'pwd',
      run(ctx) {
        const parsed = options(ctx);
        if (parsed.unknown) return invalidOption(ctx, 'pwd', `-${parsed.unknown}`);
        ctx.stdout(`${ctx.shell.cwd}\n`);
        return 0;
      },
    },
    {
      name: 'ls',
      summary: 'List directory contents',
      usage: 'ls [-a] [-l] [-1] [FILE ...]',
      run(ctx) {
        const parsed = options(ctx, 'al1d');
        if (parsed.unknown) return invalidOption(ctx, 'ls', `-${parsed.unknown}`, 2);
        const { flags, args } = parsed;
        const paths = args.length ? args : ['.'];
        const files: { info: Stat; path: string }[] = [];
        const directories: { raw: string; path: string; entries: Stat[] }[] = [];
        for (const raw of paths) {
          const path = ctx.resolve(raw);
          const info = stat(ctx, path);
          if (!info.ok) {
            ctx.stderr(`ls: cannot access '${raw}': ${strerror(info.error.code)}\n`);
            return 2;
          }
          if (info.value.kind === 'file' || flags.has('d')) {
            files.push({ info: info.value, path });
            continue;
          }
          const listed = ctx.dispatch<typeof info.value[]>('fs.list', { path });
          if (!listed.ok) {
            ctx.stderr(`ls: cannot open directory '${raw}': ${strerror(listed.error.code)}\n`);
            return 2;
          }
          const entries = flags.has('a') ? [
            { ...info.value, name: '.' }, { ...info.value, name: '..' }, ...listed.value,
          ] : listed.value;
          directories.push({
            raw, path, entries: entries.filter((entry) => flags.has('a') || !entry.name.startsWith('.')),
          });
        }
        const separator = flags.has('1') || flags.has('l') ? '\n' : ' ';
        const longEntries = [...files, ...directories.flatMap((directory) => directory.entries.map((info) => ({
          info, path: `${directory.path}/${info.name}`,
        })) )];
        const widths = flags.has('l') ? longWidths(ctx, longEntries) : undefined;
        const output = flags.has('l')
          ? files.map(({ info, path }) => formatLong(ctx, info, path, widths!))
          : files.map(({ info }) => info.name);
        if (!flags.has('l') && !flags.has('1') && directories.length && paths.length > 1) {
          const blocks = output.length ? [output.join(' ')] : [];
          for (const directory of directories) {
            blocks.push([
              `${directory.raw}:`,
              directory.entries.map((entry) => entry.name).join(' '),
            ].join('\n'));
          }
          ctx.stdout(`${blocks.join('\n\n')}\n`);
          return 0;
        }
        for (const [index, directory] of directories.entries()) {
          if (paths.length > 1) output.push(`${directory.raw}:`);
          const values = directory.entries.map((entry) => flags.has('l')
            ? formatLong(ctx, entry, `${directory.path}/${entry.name}`, widths!) : entry.name);
          if (flags.has('l')) {
            const total = directory.entries.reduce((sum, entry) => sum + Math.ceil(entry.size / 4096) * 4, 0);
            values.unshift(`total ${total}`);
          }
          output.push(...values);
          if (index < directories.length - 1) output.push('');
        }
        ctx.stdout(output.length ? `${output.join(separator)}\n` : '');
        return 0;
      },
    },
  ];
}

type LongWidths = { links: number; owner: number; size: number };

function longFields(
  ctx: Parameters<CommandDefinition['run']>[0], info: Stat, path: string,
): [string, string, string, string, string] {
  const children = info.kind === 'dir' ? ctx.dispatch<Stat[]>('fs.list', { path }) : undefined;
  const subdirectories = children?.ok ? children.value.filter((entry) => entry.kind === 'dir').length : 0;
  const links = info.kind === 'file' ? 1 : 2 + subdirectories;
  const dateValue = new Date(info.mtime);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = `${months[dateValue.getUTCMonth()]} ${String(dateValue.getUTCDate()).padStart(2)} `
    + `${String(dateValue.getUTCHours()).padStart(2, '0')}:${String(dateValue.getUTCMinutes()).padStart(2, '0')}`;
  return [modeString(info.mode, info.kind), String(links), info.owner, `${info.size}`, `${date} ${info.name}`];
}

function longWidths(ctx: Parameters<CommandDefinition['run']>[0], entries: { info: Stat; path: string }[]): LongWidths {
  const fields = entries.map(({ info, path }) => longFields(ctx, info, path));
  return {
    links: Math.max(...fields.map((field) => field[1].length), 1),
    owner: Math.max(...fields.map((field) => field[2].length), 1),
    size: Math.max(...fields.map((field) => field[3].length), 1),
  };
}

function formatLong(
  ctx: Parameters<CommandDefinition['run']>[0], info: Stat, path: string, widths: LongWidths,
): string {
  const [mode, links, owner, size, dateAndName] = longFields(ctx, info, path);
  return `${mode} ${links.padStart(widths.links)} ${owner.padStart(widths.owner)} `
    + `${owner.padStart(widths.owner)} ${size.padStart(widths.size)} ${dateAndName}`;
}
