// `docker <command>` on top of the engine: argument parsing, tables and help, matching the real CLI.

import { CATALOG } from './catalog';
import type { Container, DockerEngine, Output, RunOptions } from './engine';

const USAGE = `
Usage:  docker [OPTIONS] COMMAND

A self-sufficient runtime for containers

Common Commands:
  run         Create and run a new container from an image
  exec        Execute a command in a running container
  ps          List containers
  pull        Download an image from a registry
  images      List images

Management Commands:
  logs        Fetch the logs of a container
  start       Start one or more stopped containers
  stop        Stop one or more running containers
  restart     Restart one or more containers
  rm          Remove one or more containers
  rmi         Remove one or more images

Run 'docker COMMAND --help' for more information on a command.
`;

export function docker(engine: DockerEngine, args: string[], now = Date.now()): Output {
  const [command = '', ...rest] = args;
  switch (command) {
    case '':
    case '--help':
    case 'help': return ok(USAGE.trimStart());
    case '--version':
    case 'version': return ok('Docker version 27.3.1, build ce12230\n');
    case 'pull': return rest[0] ? engine.pull(rest[0]) : needs('pull', 'NAME[:TAG]');
    case 'run': return run(engine, rest);
    case 'ps': return ok(psTable(engine.ps(rest.includes('-a') || rest.includes('--all')), now));
    case 'images': return ok(imagesTable(engine));
    case 'image':
      if (rest[0] === 'ls') return ok(imagesTable(engine));
      break;
    case 'container':
      if (rest[0] === 'ls') return ok(psTable(engine.ps(rest.includes('-a')), now));
      break;
    case 'stop': return each(rest, 'stop', (target) => engine.stop(target));
    case 'start': return each(rest, 'start', (target) => engine.startAgain(target));
    case 'restart': return each(rest, 'restart', (target) => {
      engine.stop(target);
      return engine.startAgain(target);
    });
    case 'rm': {
      const force = rest.some((arg) => arg === '-f' || arg === '--force');
      return each(rest.filter((arg) => !arg.startsWith('-')), 'rm', (target) => engine.remove(target, force));
    }
    case 'rmi': {
      const force = rest.some((arg) => arg === '-f' || arg === '--force');
      return each(rest.filter((arg) => !arg.startsWith('-')), 'rmi', (target) => engine.removeImage(target, force));
    }
    case 'logs': return rest[0] ? engine.logs(rest[0]) : needs('logs', 'CONTAINER');
    case 'exec': {
      const options = rest.filter((arg) => /^-(it|ti|i|t)$/.test(arg));
      const [target, ...program] = rest.slice(options.length);
      return target && program.length ? engine.exec(target, program) : needs('exec', 'CONTAINER COMMAND [ARG...]');
    }
  }
  return { stdout: '', stderr: `docker: '${args.join(' ')}' is not a docker command.\nSee 'docker --help'\n`, code: 1 };
}

function run(engine: DockerEngine, args: string[]): Output {
  const options: RunOptions = {
    image: '', args: [], detach: false, ports: [], env: {}, remove: false, interactive: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const value = () => {
      const inline = arg.includes('=') && arg.startsWith('--') ? arg.slice(arg.indexOf('=') + 1) : undefined;
      return inline ?? args[++index];
    };
    if (!arg.startsWith('-')) {
      options.image = arg;
      options.args = args.slice(index + 1);
      break;
    }
    if (arg === '-d' || arg === '--detach') options.detach = true;
    else if (arg === '--rm') options.remove = true;
    else if (/^-[it]+$/.test(arg) || arg === '--interactive' || arg === '--tty') options.interactive = true;
    else if (arg === '--name' || arg.startsWith('--name=')) options.name = value();
    else if (arg === '-p' || arg === '--publish' || arg.startsWith('--publish=')) {
      const mapping = /^(\d+):(\d+)$/.exec(value() ?? '');
      if (!mapping) return usageError('invalid argument for "-p, --publish" flag: expected HOST_PORT:CONTAINER_PORT');
      options.ports.push({ host: Number(mapping[1]), container: Number(mapping[2]) });
    } else if (arg === '-e' || arg === '--env' || arg.startsWith('--env=')) {
      const [key, ...rest] = (value() ?? '').split('=');
      if (key) options.env[key] = rest.join('=');
    } else return usageError(`unknown flag: ${arg}`);
  }
  if (!options.image) return needs('run', 'IMAGE [COMMAND] [ARG...]');
  return engine.run(options);
}

function each(targets: string[], command: string, action: (target: string) => Output): Output {
  if (!targets.length) return needs(command, command === 'rmi' ? 'IMAGE [IMAGE...]' : 'CONTAINER [CONTAINER...]');
  const results = targets.map(action);
  return {
    stdout: results.map((result) => result.stdout).join(''),
    stderr: results.map((result) => result.stderr).join(''),
    code: results.some((result) => result.code !== 0) ? 1 : 0,
  };
}

function psTable(containers: Container[], now: number): string {
  const rows = containers.map((container) => [
    container.id.slice(0, 12),
    container.image,
    container.command,
    `${ago(now - container.created)} ago`,
    container.stopped === null
      ? `Up ${ago(now - container.started)}`
      : `Exited (${container.exitCode}) ${ago(now - container.stopped)} ago`,
    container.stopped === null
      ? container.ports.map((port) => `0.0.0.0:${port.host}->${port.container}/tcp`).join(', ')
      : '',
    container.name,
  ]);
  return table(['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], rows);
}

function imagesTable(engine: DockerEngine): string {
  const rows = engine.state.images.map((name) => {
    const image = CATALOG[name]!;
    return [image.name, image.tag, image.id, '2 weeks ago', image.size];
  });
  return table(['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'], rows);
}

/** Docker's tables: each column as wide as its widest cell, with three spaces between columns. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => row[column]!.length)));
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column]!)).join('   ').trimEnd();
  return [line(headers), ...rows.map(line)].join('\n') + '\n';
}

/** "5 seconds", "About a minute", "3 minutes", "2 hours", like Docker's human-readable durations. */
export function ago(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return seconds === 1 ? 'Less than a second' : `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return 'About a minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'About an hour' : `${hours} hours`;
}

function needs(command: string, usage: string): Output {
  return { stdout: '', stderr: `"docker ${command}" requires at least 1 argument.\nSee 'docker ${command} --help'.\n\n`
    + `Usage:  docker ${command} [OPTIONS] ${usage}\n`, code: 1 };
}

function usageError(message: string): Output {
  return { stdout: '', stderr: `${message}\nSee 'docker run --help'.\n`, code: 125 };
}

function ok(stdout: string): Output {
  return { stdout, stderr: '', code: 0 };
}

/** `curl [-s] [-i] http://localhost:PORT/path` against containers' published ports. */
export function curl(engine: DockerEngine, args: string[]): Output {
  const url = args.find((arg) => !arg.startsWith('-'));
  if (!url) return { stdout: '', stderr: 'curl: try \'curl --help\' for more information\n', code: 2 };
  const match = /^(?:https?:\/\/)?(localhost|127\.0\.0\.1)(?::(\d+))?(\/[^\s]*)?$/.exec(url);
  if (!match) {
    return { stdout: '', stderr: `curl: (6) Could not resolve host: ${url.replace(/^https?:\/\//, '').split('/')[0]}\n`
      + '(tuxos has no internet; only localhost works here.)\n', code: 6 };
  }
  return engine.httpGet(Number(match[2] ?? 80), match[3] ?? '/');
}
