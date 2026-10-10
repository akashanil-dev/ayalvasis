// The images this pretend Docker Hub has, and how containers made from them behave.
// Sizes and default commands are close to the real images so `docker images` and `docker ps` look familiar.

export interface ImageInfo {
  name: string;
  tag: string;
  id: string;
  size: string;
  /** What `docker ps` shows in COMMAND. */
  command: string;
  /** A long-running service (nginx, redis...) or a one-shot program (hello-world, alpine). */
  service: boolean;
  /** Output a service prints when it starts: what `docker logs` shows. */
  startup?: string[];
  /** For services: the container port it listens on. */
  port?: number;
  osRelease?: string;
  /** Environment variables the image refuses to start without. */
  requiredEnv?: { name: string; message: string };
}

const ALPINE_RELEASE = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"\n';
const DEBIAN_RELEASE = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\n'
  + 'ID=debian\n';

export const CATALOG: Record<string, ImageInfo> = {
  'hello-world': {
    name: 'hello-world', tag: 'latest', id: 'd2c94e258dcb', size: '13.3kB', command: '"/hello"', service: false,
  },
  alpine: {
    name: 'alpine', tag: 'latest', id: '91ef0af61f39', size: '7.8MB', command: '"/bin/sh"', service: false,
    osRelease: ALPINE_RELEASE,
  },
  ubuntu: {
    name: 'ubuntu', tag: 'latest', id: '59ab366372d5', size: '78.1MB', command: '"/bin/bash"', service: false,
    osRelease: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n',
  },
  python: {
    name: 'python', tag: 'latest', id: '6a8a2b2d8e53', size: '1.02GB', command: '"python3"', service: false,
    osRelease: DEBIAN_RELEASE,
  },
  nginx: {
    name: 'nginx', tag: 'latest', id: '3b25b682ea82', size: '192MB', command: '"/docker-entrypoint.…"',
    service: true, port: 80,
    startup: [
      '/docker-entrypoint.sh: Configuration complete; ready for start up',
      'nginx: [notice] start worker processes',
    ],
  },
  redis: {
    name: 'redis', tag: 'latest', id: '590b81f2fea1', size: '117MB', command: '"docker-entrypoint.s…"',
    service: true, port: 6379,
    startup: ['* Server initialized', '* Ready to accept connections tcp'],
  },
  postgres: {
    name: 'postgres', tag: 'latest', id: 'b781f3a53e61', size: '435MB', command: '"docker-entrypoint.s…"',
    service: true, port: 5432,
    startup: ['LOG:  database system is ready to accept connections'],
    requiredEnv: {
      name: 'POSTGRES_PASSWORD',
      message: 'Error: Database is uninitialized and superuser password is not specified.\n'
        + '       You must specify POSTGRES_PASSWORD to a non-empty value for the\n'
        + '       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".',
    },
  },
};

export const HELLO_MESSAGE = `
Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
 3. The Docker daemon created a new container from that image which runs the
    executable that produces the output you are currently reading.
 4. The Docker daemon streamed that output to the Docker client, which sent it
    to your terminal.

To try something more ambitious, you can run an Ubuntu container with:
 $ docker run -it ubuntu bash
`;

export const NGINX_PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>
</body>
</html>
`;
