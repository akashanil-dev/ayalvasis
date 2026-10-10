import type { CommandDefinition } from './types';
import { options, parseMode, read, report, stat } from './helpers';

export function fileCommands(): CommandDefinition[] {
  return [cat(), mkdir(), touch(), remove(), copy(), move(), chmod()];
}

function cat(): CommandDefinition {
  return {
    name: 'cat', summary: 'Concatenate files', usage: 'cat [FILE ...]',
    run(ctx) {
      if (!ctx.args.length) {
        ctx.stdout(ctx.stdin);
        return 0;
      }
      let code = 0;
      for (const raw of ctx.args) {
        const path = ctx.resolve(raw);
        const value = read(ctx, path);
        if (value === undefined) {
          ctx.stderr(`cat: ${path}: No such file or directory\n`);
          code = 1;
        } else ctx.stdout(value);
      }
      return code;
    },
  };
}

function mkdir(): CommandDefinition {
  return {
    name: 'mkdir', summary: 'Create directories', usage: 'mkdir [-p] DIRECTORY ...',
    run(ctx) {
      const { flags, args } = options(ctx);
      if (!args.length) {
        ctx.stderr('mkdir: missing operand\n');
        return 1;
      }
      let code = 0;
      for (const raw of args) {
        const result = ctx.dispatch('fs.mkdir', { path: ctx.resolve(raw), parents: flags.has('p') });
        if (!result.ok) {
          ctx.stderr(`mkdir: ${result.error.message}\n`);
          code = 1;
        }
      }
      return code;
    },
  };
}

function touch(): CommandDefinition {
  return {
    name: 'touch', summary: 'Create empty files', usage: 'touch FILE ...',
    run(ctx) {
      let code = 0;
      for (const raw of ctx.args) {
        const path = ctx.resolve(raw);
        const existing = stat(ctx, path);
        const result = existing.ok
          ? existing.value.kind === 'file'
            ? { ok: true as const, value: undefined }
            : { ok: false as const, error: { code: 'EISDIR', message: `${path}: Is a directory` } }
          : ctx.dispatch('fs.write', { path, content: '' });
        if (!result.ok) {
          ctx.stderr(`touch: ${result.error.message}\n`);
          code = 1;
        }
      }
      return code;
    },
  };
}

function remove(): CommandDefinition {
  return {
    name: 'rm', summary: 'Remove files or directories', usage: 'rm [-r] [-f] FILE ...',
    run(ctx) {
      const { flags, args } = options(ctx);
      if (!args.length) {
        ctx.stderr('rm: missing operand\n');
        return 1;
      }
      let code = 0;
      for (const raw of args) {
        const result = ctx.dispatch('fs.remove', { path: ctx.resolve(raw), recursive: flags.has('r') });
        if (!result.ok && !flags.has('f')) {
          ctx.stderr(`rm: ${result.error.message}\n`);
          code = 1;
        }
      }
      return code;
    },
  };
}

function copy(): CommandDefinition {
  return {
    name: 'cp', summary: 'Copy files and directories', usage: 'cp [-r] SOURCE DEST',
    run(ctx) {
      const { flags, args } = options(ctx);
      if (args.length !== 2) {
        ctx.stderr('cp: missing file operand\n');
        return 1;
      }
      return copyPath(ctx, ctx.resolve(args[0]!), ctx.resolve(args[1]!), flags.has('r'));
    },
  };
}

function copyPath(ctx: Parameters<CommandDefinition['run']>[0], source: string, destination: string, recursive: boolean): number {
  const sourceInfo = stat(ctx, source);
  if (!sourceInfo.ok) return report(ctx, 'cp', sourceInfo);
  if (sourceInfo.value.kind === 'file') {
    const value = read(ctx, source);
    if (value === undefined) {
      ctx.stderr(`cp: ${source}: No such file or directory\n`);
      return 1;
    }
    return report(ctx, 'cp', ctx.dispatch('fs.write', { path: destination, content: value }));
  }
  if (!recursive) {
    ctx.stderr(`cp: -r not specified; omitting directory '${source}'\n`);
    return 1;
  }
  const created = ctx.dispatch('fs.mkdir', { path: destination, parents: false });
  if (!created.ok) return report(ctx, 'cp', created);
  const children = ctx.dispatch<typeof sourceInfo.value[]>('fs.list', { path: source });
  if (!children.ok) return report(ctx, 'cp', children);
  for (const child of children.value) {
    const code = copyPath(ctx, `${source}/${child.name}`, `${destination}/${child.name}`, true);
    if (code !== 0) return code;
  }
  return 0;
}

function move(): CommandDefinition {
  return {
    name: 'mv', summary: 'Move files and directories', usage: 'mv SOURCE DEST',
    run(ctx) {
      if (ctx.args.length !== 2) {
        ctx.stderr('mv: missing file operand\n');
        return 1;
      }
      const source = ctx.resolve(ctx.args[0]!);
      const destination = ctx.resolve(ctx.args[1]!);
      const sourceInfo = stat(ctx, source);
      if (!sourceInfo.ok) return report(ctx, 'mv', sourceInfo);
      if (sourceInfo.value.kind === 'dir') {
        const copied = copyPath(ctx, source, destination, true);
        if (copied !== 0) return copied;
      } else {
        const value = read(ctx, source);
        if (value === undefined) return 1;
        const written = ctx.dispatch('fs.write', { path: destination, content: value });
        if (!written.ok) return report(ctx, 'mv', written);
      }
      return report(ctx, 'mv', ctx.dispatch('fs.remove', { path: source, recursive: sourceInfo.value.kind === 'dir' }));
    },
  };
}

function chmod(): CommandDefinition {
  return {
    name: 'chmod', summary: 'Change file mode bits', usage: 'chmod MODE FILE',
    run(ctx) {
      if (ctx.args.length !== 2) {
        ctx.stderr('chmod: missing operand\n');
        return 1;
      }
      const path = ctx.resolve(ctx.args[1]!);
      const info = stat(ctx, path);
      if (!info.ok) return report(ctx, 'chmod', info);
      const mode = parseMode(ctx.args[0]!, info.value.mode);
      if (mode === undefined) {
        ctx.stderr(`chmod: invalid mode: '${ctx.args[0]}'\n`);
        return 1;
      }
      return report(ctx, 'chmod', ctx.dispatch('fs.chmod', { path, mode }));
    },
  };
}
