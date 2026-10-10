import type { CommandDefinition } from './types';
import { modeString, options, report, stat } from './helpers';

export function navigationCommands(): CommandDefinition[] {
  return [
    {
      name: 'cd',
      summary: 'Change the shell working directory',
      usage: 'cd [DIR]',
      run(ctx) {
        const previous = ctx.shell.cwd;
        const target = ctx.args[0] === '-'
          ? ctx.shell.env.OLDPWD || ctx.shell.cwd
          : ctx.args[0] || ctx.shell.env.HOME;
        const path = ctx.resolve(target!);
        const result = stat(ctx, path);
        if (!result.ok) return report(ctx, 'cd', result);
        if (result.value.kind !== 'dir') {
          ctx.stderr(`cd: ${path}: Not a directory\n`);
          return 1;
        }
        ctx.shell.env.OLDPWD = previous;
        ctx.shell.cwd = path;
        ctx.shell.env.PWD = path;
        if (ctx.args[0] === '-') ctx.stdout(`${path}\n`);
        return 0;
      },
    },
    {
      name: 'pwd',
      summary: 'Print the working directory',
      usage: 'pwd',
      run(ctx) {
        ctx.stdout(`${ctx.shell.cwd}\n`);
        return 0;
      },
    },
    {
      name: 'ls',
      summary: 'List directory contents',
      usage: 'ls [-a] [-l] [-1] [FILE ...]',
      run(ctx) {
        const { flags, args } = options(ctx);
        const paths = args.length ? args : ['.'];
        const output: string[] = [];
        for (const raw of paths) {
          const path = ctx.resolve(raw);
          const info = stat(ctx, path);
          if (!info.ok) {
            ctx.stderr(`ls: ${info.error.message}\n`);
            return 2;
          }
          if (info.value.kind === 'file') {
            output.push(flags.has('l') ? formatLong(info.value) : info.value.name);
            continue;
          }
          const listed = ctx.dispatch<typeof info.value[]>('fs.list', { path });
          if (!listed.ok) {
            ctx.stderr(`ls: ${listed.error.message}\n`);
            return 2;
          }
          const visible = listed.value.filter((entry) => flags.has('a') || !entry.name.startsWith('.'));
          output.push(...visible.map((entry) => flags.has('l') ? formatLong(entry) : entry.name));
        }
        const separator = flags.has('1') || flags.has('l') ? '\n' : ' ';
        ctx.stdout(output.length ? `${output.join(separator)}\n` : '');
        return 0;
      },
    },
  ];
}

function formatLong(info: { mode: number; kind: 'file' | 'dir'; owner: string; size: number; name: string }): string {
  return `${modeString(info.mode, info.kind)} ${info.owner} ${info.size} ${info.name}`;
}
