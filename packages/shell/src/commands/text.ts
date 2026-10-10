import type { CommandDefinition } from './types';
import { lines, options, read, recursiveFiles } from './helpers';

export function textCommands(): CommandDefinition[] {
  return [echo(), head(), tail(), wc(), grep(), sort(), uniq()];
}

function echo(): CommandDefinition {
  return {
    name: 'echo', summary: 'Write arguments to standard output', usage: 'echo [-n] [ARG ...]',
    run(ctx) {
      const noNewline = ctx.args[0] === '-n';
      ctx.stdout(ctx.args.slice(noNewline ? 1 : 0).join(' ') + (noNewline ? '' : '\n'));
      return 0;
    },
  };
}

function head(): CommandDefinition {
  return {
    name: 'head', summary: 'Output the first part of files', usage: 'head [-n N] [FILE]',
    run: (ctx) => slice(ctx, true),
  };
}

function tail(): CommandDefinition {
  return {
    name: 'tail', summary: 'Output the last part of files', usage: 'tail [-n N] [FILE]',
    run: (ctx) => slice(ctx, false),
  };
}

function slice(ctx: Parameters<CommandDefinition['run']>[0], first: boolean): number {
  const count = ctx.args[0] === '-n' ? Number(ctx.args[1]) : 10;
  const file = ctx.args[0] === '-n' ? ctx.args[2] : ctx.args[0];
  const text = file ? read(ctx, ctx.resolve(file)) : ctx.stdin;
  if (text === undefined) {
    ctx.stderr(`${first ? 'head' : 'tail'}: ${file}: No such file or directory\n`);
    return 1;
  }
  const selected = lines(text).slice(first ? 0 : -count, first ? count : undefined);
  ctx.stdout(selected.length ? `${selected.join('\n')}\n` : '');
  return 0;
}

function wc(): CommandDefinition {
  return {
    name: 'wc', summary: 'Print newline, word, and byte counts', usage: 'wc [-l] [-w] [-c] [FILE]',
    run(ctx) {
      const { flags, args } = options(ctx);
      const file = args[0];
      const text = file ? read(ctx, ctx.resolve(file)) : ctx.stdin;
      if (text === undefined) {
        ctx.stderr(`wc: ${file}: No such file or directory\n`);
        return 1;
      }
      const selected = flags.has('l') || flags.has('w') || flags.has('c');
      const counts = [
        flags.has('l') || !selected ? lines(text).length : undefined,
        flags.has('w') || !selected ? wordCount(text) : undefined,
        flags.has('c') || !selected ? text.length : undefined,
      ].filter((value): value is number => value !== undefined);
      ctx.stdout(`${counts.join(' ')}${file ? ` ${file}` : ''}\n`);
      return 0;
    },
  };
}

function grep(): CommandDefinition {
  return {
    name: 'grep', summary: 'Search for matching lines', usage: 'grep [-i] [-n] [-v] [-r] [-c] PATTERN [FILE]',
    run(ctx) {
      const { flags, args } = options(ctx);
      if (!args.length) {
        ctx.stderr('grep: missing pattern\n');
        return 2;
      }
      const files = args.slice(1);
      const prefixNames = flags.has('r') || files.length > 1;
      const contents: { name?: string; text: string }[] = [];
      if (!files.length) contents.push({ text: ctx.stdin });
      for (const raw of files) {
        const path = ctx.resolve(raw);
        const info = ctx.dispatch<{ kind: 'file' | 'dir' }>('fs.stat', { path });
        if (!info.ok) {
          ctx.stderr(`grep: ${info.error.message}\n`);
          continue;
        }
        const paths = info.value.kind === 'dir' && flags.has('r') ? recursiveFiles(ctx, path) : [path];
        for (const file of paths) {
          const text = read(ctx, file);
          if (text !== undefined) contents.push({ name: info.value.kind === 'dir' ? file : raw, text });
        }
      }
      const pattern = new RegExp(args[0]!, flags.has('i') ? 'i' : '');
      let matches = 0;
      for (const file of contents) {
        const found = lines(file.text)
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => flags.has('v') ? !pattern.test(line) : pattern.test(line));
        matches += found.length;
        if (flags.has('c')) {
          ctx.stdout(`${file.name && prefixNames ? `${file.name}:` : ''}${found.length}\n`);
        } else {
          for (const item of found) {
            const name = file.name && prefixNames ? `${file.name}:` : '';
            const number = flags.has('n') ? `${item.index + 1}:` : '';
            ctx.stdout(`${name}${number}${item.line}\n`);
          }
        }
      }
      return matches ? 0 : 1;
    },
  };
}

function sort(): CommandDefinition {
  return {
    name: 'sort', summary: 'Sort lines of text', usage: 'sort [-r] [-n] [-u] [FILE]',
    run(ctx) {
      const { flags, args } = options(ctx);
      const text = args[0] ? read(ctx, ctx.resolve(args[0])) : ctx.stdin;
      if (text === undefined) {
        ctx.stderr(`sort: ${args[0]}: No such file or directory\n`);
        return 1;
      }
      let values = lines(text);
      if (flags.has('u')) values = [...new Set(values)];
      values.sort((left, right) => flags.has('n')
        ? Number.parseFloat(left) - Number.parseFloat(right)
        : left.localeCompare(right));
      if (flags.has('r')) values.reverse();
      ctx.stdout(values.length ? `${values.join('\n')}\n` : '');
      return 0;
    },
  };
}

function uniq(): CommandDefinition {
  return {
    name: 'uniq', summary: 'Report or omit repeated lines', usage: 'uniq [-c]',
    run(ctx) {
      const { flags } = options(ctx);
      const output: string[] = [];
      for (const line of lines(ctx.stdin)) {
        const previous = output.at(-1);
        const previousLine = previous?.slice(previous.indexOf(' ') + 1);
        if (previous && (flags.has('c') ? previousLine : previous) === line) {
          if (flags.has('c')) output[output.length - 1] = `${Number(previous.slice(0, previous.indexOf(' '))) + 1} ${line}`;
        } else {
          output.push(flags.has('c') ? `1 ${line}` : line);
        }
      }
      ctx.stdout(output.length ? `${output.join('\n')}\n` : '');
      return 0;
    },
  };
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
