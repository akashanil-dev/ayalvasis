// Kernel state and the fresh system a new learner boots into.

import { KernelError } from './errors';
import { dir, file, type DirNode } from './vfs';

export interface UserAccount {
  uid: number;
  home: string;
}

export interface Window {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  z: number;
}

export interface SessionState {
  windows: Window[];
  focusedId: string | null;
  nextId: number;
}

export interface KernelState {
  hostname: string;
  users: Record<string, UserAccount>;
  fs: DirNode;
  session: SessionState;
}

// Same rule as useradd's default NAME_REGEX on Debian.
const USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;

export function createInitialState(username: string, hostname = 'ayalvasis', now = 0): KernelState {
  if (!USERNAME.test(username) || username === 'root') {
    throw new KernelError('EINVAL', `invalid username: ${JSON.stringify(username)}`);
  }
  const passwd = [
    'root:x:0:0:root:/root:/bin/bash',
    `${username}:x:1000:1000:${username}:/home/${username}:/bin/bash`,
  ].join('\n');

  return {
    hostname,
    users: {
      root: { uid: 0, home: '/root' },
      [username]: { uid: 1000, home: `/home/${username}` },
    },
    fs: dir('root', 0o755, {
      bin: dir('root', 0o755, {}, now),
      etc: dir('root', 0o755, {
        hostname: file('root', 0o644, hostname, now),
        passwd: file('root', 0o644, passwd, now),
      }, now),
      home: dir('root', 0o755, {
        [username]: dir(username, 0o755, {
          Documents: dir(username, 0o755, {}, now),
        }, now),
      }, now),
      root: dir('root', 0o700, {}, now),
      tmp: dir('root', 0o777, {}, now),
      usr: dir('root', 0o755, { bin: dir('root', 0o755, {}, now) }, now),
      var: dir('root', 0o755, { log: dir('root', 0o755, {}, now) }, now),
    }, now),
    session: { windows: [], focusedId: null, nextId: 1 },
  };
}
