// A small, deterministic model of the Docker daemon: images, containers, ports and logs.
// It produces the same messages and exit codes as the real docker CLI for the cases learners meet first.

import { CATALOG, HELLO_MESSAGE, NGINX_PAGE, type ImageInfo } from './catalog';

export interface Container {
  id: string;
  name: string;
  image: string;
  command: string;
  created: number;
  /** When it last started, and when it stopped (null while running). */
  started: number;
  stopped: number | null;
  exitCode: number;
  ports: { host: number; container: number }[];
  env: Record<string, string>;
  logs: string[];
}

export interface EngineState {
  images: string[];
  containers: Container[];
  counter: number;
}

export interface Output {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  image: string;
  args: string[];
  detach: boolean;
  name?: string;
  ports: { host: number; container: number }[];
  env: Record<string, string>;
  remove: boolean;
  interactive: boolean;
}

const ADJECTIVES = ['brave', 'calm', 'eager', 'gentle', 'happy', 'jolly', 'kind', 'quirky', 'sharp', 'zen'];
const SCIENTISTS = [
  'curie', 'hopper', 'lovelace', 'turing', 'raman', 'bose', 'ramanujan', 'noether', 'darwin', 'tesla',
];

export class DockerEngine {
  constructor(public state: EngineState = { images: [], containers: [], counter: 0 }, private now = Date.now) {}

  /** The name:tag a reference means, and the catalog entry if it exists. */
  resolve(reference: string): { ref: string; info: ImageInfo | undefined } {
    const [name, tag = 'latest'] = reference.split(':') as [string, string?];
    const info = CATALOG[name];
    return { ref: `${name}:${tag}`, info: info && tag === info.tag ? info : undefined };
  }

  pull(reference: string): Output {
    const { ref, info } = this.resolve(reference);
    const name = ref.split(':')[0]!;
    if (!info) {
      return fail(`Error response from daemon: pull access denied for ${name}, repository does not exist or may `
        + 'require \'docker login\': denied: requested access to the resource is denied\n');
    }
    if (this.state.images.includes(name)) return ok(`latest: Pulling from library/${name}\nDigest: sha256:${info.id}`
      + `${'0'.repeat(52)}\nStatus: Image is up to date for ${ref}\ndocker.io/library/${ref}\n`);
    this.state.images.push(name);
    return ok(`latest: Pulling from library/${name}\n${info.id.slice(0, 8)}a2f4: Pull complete\n`
      + `Digest: sha256:${info.id}${'0'.repeat(52)}\nStatus: Downloaded newer image for ${ref}\n`
      + `docker.io/library/${ref}\n`);
  }

  run(options: RunOptions): Output {
    const { ref, info } = this.resolve(options.image);
    let prefix = '';
    if (!info || !this.state.images.includes(ref.split(':')[0]!)) {
      prefix = `Unable to find image '${ref}' locally\n`;
      const pulled = this.pull(options.image);
      if (pulled.code !== 0) return { stdout: '', stderr: prefix + `docker: ${pulled.stderr}`, code: 125 };
      // `docker run` shows the pull progress but not the final "docker.io/library/..." line `docker pull` prints.
      prefix += pulled.stdout.replace(/docker\.io\/library\/\S+\n$/, '');
    }
    const image = info!;
    const clash = options.name && this.state.containers.find((each) => each.name === options.name);
    if (clash) {
      return { stdout: '', stderr: prefix + 'docker: Error response from daemon: Conflict. '
        + `The container name "/${options.name}" `
        + `is already in use by container "${clash.id}". You have to remove (or rename) that container to be able `
        + 'to reuse that name.\n', code: 125 };
    }
    const container = this.create(image, options);
    const taken = options.ports.find((port) => this.portOwner(port.host));
    if (taken) {
      container.stopped = this.now();
      container.exitCode = 128;
      this.state.containers.push(container);
      return { stdout: '', stderr: prefix + `docker: Error response from daemon: driver failed programming external `
        + `connectivity on endpoint ${container.name}: Bind for 0.0.0.0:${taken.host} failed: port is already `
        + 'allocated.\n', code: 125 };
    }
    this.state.containers.push(container);
    const result = this.start(container, image, options);
    if (options.remove && container.stopped !== null) this.forget(container);
    return { stdout: prefix + result.stdout, stderr: result.stderr, code: result.code };
  }

  ps(all: boolean): Container[] {
    return this.state.containers.filter((each) => all || each.stopped === null);
  }

  stop(target: string): Output {
    const container = this.find(target);
    if (!container) return noSuch(target);
    if (container.stopped === null) {
      container.stopped = this.now();
      container.exitCode = 0;
      container.logs.push('signal 3 (SIGQUIT) received, shutting down');
    }
    return ok(`${target}\n`);
  }

  startAgain(target: string): Output {
    const container = this.find(target);
    if (!container) return noSuch(target);
    const busy = container.ports.find((port) => {
      const owner = this.portOwner(port.host);
      return owner && owner !== container;
    });
    if (busy) return fail(`Error response from daemon: driver failed programming external connectivity: Bind for `
      + `0.0.0.0:${busy.host} failed: port is already allocated\n`);
    const image = this.resolve(container.image).info;
    if (image?.service) {
      container.started = this.now();
      container.stopped = null;
      container.logs.push(...(image.startup ?? []));
    }
    return ok(`${target}\n`);
  }

  remove(target: string, force: boolean): Output {
    const container = this.find(target);
    if (!container) return noSuch(target);
    if (container.stopped === null && !force) {
      return fail(`Error response from daemon: cannot remove container "/${container.name}": container is running: `
        + 'stop the container before removing or force remove\n');
    }
    this.forget(container);
    return ok(`${target}\n`);
  }

  removeImage(reference: string, force: boolean): Output {
    const { ref } = this.resolve(reference);
    const name = ref.split(':')[0]!;
    if (!this.state.images.includes(name)) return fail(`Error response from daemon: No such image: ${ref}\n`);
    const user = this.state.containers.find((each) => each.image === name);
    if (user && !force) {
      return fail(`Error response from daemon: conflict: unable to remove repository reference "${reference}" `
        + `(must force) - container ${user.id.slice(0, 12)} is using its referenced image ${CATALOG[name]!.id}\n`);
    }
    this.state.images = this.state.images.filter((each) => each !== name);
    return ok(`Untagged: ${ref}\nDeleted: sha256:${CATALOG[name]!.id}${'0'.repeat(52)}\n`);
  }

  logs(target: string): Output {
    const container = this.find(target);
    if (!container) return noSuch(target);
    return ok(container.logs.map((line) => `${line}\n`).join(''));
  }

  exec(target: string, args: string[]): Output {
    const container = this.find(target);
    if (!container) return noSuch(target);
    if (container.stopped !== null) {
      return fail(`Error response from daemon: container ${container.id} is not running\n`);
    }
    return this.program(container, this.resolve(container.image).info!, args);
  }

  /** What `curl http://localhost:<port>/` gets back, if a running container publishes that port. */
  httpGet(port: number, path: string): Output {
    const container = this.portOwner(port);
    const image = container && this.resolve(container.image).info;
    if (!container || !image) {
      return { stdout: '', stderr: `curl: (7) Failed to connect to localhost port ${port} after 0 ms: Couldn't `
        + 'connect to server\n', code: 7 };
    }
    if (image.name !== 'nginx') {
      return { stdout: '', stderr: 'curl: (52) Empty reply from server\n', code: 52 };
    }
    const found = path === '/' || path === '/index.html';
    const [status, bytes] = found ? [200, 615] : [404, 153];
    container.logs.push(`172.17.0.1 - - "GET ${path} HTTP/1.1" ${status} ${bytes} "-" "curl/8.5.0"`);
    return found ? ok(NGINX_PAGE) : ok('<html>\n<head><title>404 Not Found</title></head>\n<body>\n'
      + '<center><h1>404 Not Found</h1></center>\n<hr><center>nginx</center>\n</body>\n</html>\n');
  }

  find(target: string): Container | undefined {
    return this.state.containers.find((each) => each.name === target)
      ?? this.state.containers.find((each) => target.length >= 3 && each.id.startsWith(target));
  }

  private create(image: ImageInfo, options: RunOptions): Container {
    const count = ++this.state.counter;
    const id = hexId(`${count}:${options.name ?? ''}:${image.name}`);
    const command = options.args.length ? `"${options.args.join(' ')}"`.replace(/^(.{19}).+"$/, '$1…"') : image.command;
    return {
      id,
      name: options.name ?? `${ADJECTIVES[count % ADJECTIVES.length]}_${SCIENTISTS[(count * 7) % SCIENTISTS.length]}`,
      image: image.name,
      command,
      created: this.now(),
      started: this.now(),
      stopped: null,
      exitCode: 0,
      ports: options.ports,
      env: options.env,
      logs: [],
    };
  }

  private start(container: Container, image: ImageInfo, options: RunOptions): Output {
    if (image.requiredEnv && !options.env[image.requiredEnv.name]) {
      container.logs.push(...image.requiredEnv.message.split('\n'));
      return this.exit(container, { stdout: '', stderr: `${image.requiredEnv.message}\n`, code: 1 });
    }
    if (image.service) {
      container.logs.push(...(image.startup ?? []));
      if (options.detach) return ok(`${container.id}\n`);
      // A real foreground service would hold the terminal until Ctrl+C, which stops it. Show that, then stop.
      return this.exit(container, ok(`${(image.startup ?? []).join('\n')}\n(ayalvasis: in the foreground this `
        + 'container would keep the terminal busy until Ctrl+C, which stops it. Add -d to run it in the '
        + 'background instead.)\n'));
    }
    if (options.interactive && !options.args.length) {
      return this.exit(container, { stdout: '', stderr: 'ayalvasis: interactive shells inside containers are not '
        + `available here yet. Try running one command instead, e.g. docker run ${image.name} cat /etc/os-release\n`,
      code: 1 });
    }
    const result = image.name === 'hello-world' ? ok(HELLO_MESSAGE) : this.program(container, image, options.args);
    container.logs.push(...(result.stdout + result.stderr).split('\n').filter(Boolean));
    const output = this.exit(container, result);
    return options.detach ? ok(`${container.id}\n`) : output;
  }

  /** The handful of commands that work inside a container. */
  private program(container: Container, image: ImageInfo, args: string[]): Output {
    const [command, ...rest] = args;
    if (!command) return ok('');
    switch (command) {
      case 'echo': return ok(`${rest.join(' ')}\n`);
      case 'whoami': return ok('root\n');
      case 'hostname': return ok(`${container.id.slice(0, 12)}\n`);
      case 'pwd': return ok('/\n');
      case 'uname': return ok(rest.includes('-a') ? `Linux ${container.id.slice(0, 12)} 6.6.0 #1 SMP x86_64 Linux\n`
        : 'Linux\n');
      case 'ls': return ok('bin  dev  etc  home  lib  proc  root  run  sbin  srv  sys  tmp  usr  var\n');
      case 'env': return ok(Object.entries({ PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOSTNAME: container.id.slice(0, 12), ...container.env }).map(([key, value]) => `${key}=${value}\n`).join(''));
      case 'cat':
        if (rest[0] === '/etc/os-release' && image.osRelease) return ok(image.osRelease);
        return { stdout: '', stderr: `cat: can't open '${rest[0] ?? ''}': No such file or directory\n`, code: 1 };
      case 'python3':
      case 'python':
        if (image.name === 'python' && rest[0] === '--version') return ok('Python 3.13.0\n');
        break;
    }
    return { stdout: '', stderr: `docker: Error response from daemon: failed to create task for container: `
      + `exec: "${command}": executable file not found in $PATH: unknown.\n`, code: 127 };
  }

  private exit(container: Container, result: Output): Output {
    container.stopped = this.now();
    container.exitCode = result.code;
    return result;
  }

  private portOwner(host: number): Container | undefined {
    return this.state.containers.find((each) => each.stopped === null && each.ports.some((port) => port.host === host));
  }

  private forget(container: Container): void {
    this.state.containers = this.state.containers.filter((each) => each !== container);
  }
}

function ok(stdout: string): Output {
  return { stdout, stderr: '', code: 0 };
}

function fail(stderr: string): Output {
  return { stdout: '', stderr, code: 1 };
}

function noSuch(target: string): Output {
  return fail(`Error response from daemon: No such container: ${target}\n`);
}

/** A stable 64-character hex id, like Docker's container ids. */
function hexId(seed: string): string {
  let hash = 0x811c9dc5;
  let out = '';
  for (let round = 0; out.length < 64; round += 1) {
    for (const char of `${seed}#${round}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    out += hash.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}
