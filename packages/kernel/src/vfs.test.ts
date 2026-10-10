import { describe, expect, it } from 'vitest';
import { KernelError } from './errors';
import { createInitialState } from './state';
import * as vfs from './vfs';

const fresh = () => createInitialState('ada').fs;

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof KernelError) return err.code;
    throw err;
  }
  return undefined;
}

describe('resolvePath', () => {
  it('resolves relative paths, dots and repeated slashes', () => {
    expect(vfs.resolvePath('docs/../notes//a.txt', '/home/ada')).toBe('/home/ada/notes/a.txt');
    expect(vfs.resolvePath('/../..')).toBe('/');
    expect(vfs.resolvePath('.', '/tmp')).toBe('/tmp');
  });
});

describe('files and directories', () => {
  it('writes, appends and reads a file in the home folder', () => {
    const root = fresh();
    vfs.writeFile(root, '/home/ada/todo.txt', 'ada', 'learn ls\n');
    vfs.writeFile(root, '/home/ada/todo.txt', 'ada', 'learn grep\n', true);
    expect(vfs.readFile(root, '/home/ada/todo.txt', 'ada')).toBe('learn ls\nlearn grep\n');
    expect(vfs.stat(root, '/home/ada/todo.txt', 'ada')).toMatchObject({ owner: 'ada', mode: 0o644 });
  });

  it('updates file and parent directory mtimes on writes and entry changes', () => {
    const root = fresh();
    const homeBefore = vfs.stat(root, '/home/ada', 'ada').mtime;
    vfs.writeFile(root, '/home/ada/todo.txt', 'ada', 'hi', false, 10);
    expect(vfs.stat(root, '/home/ada/todo.txt', 'ada').mtime).toBe(10);
    expect(vfs.stat(root, '/home/ada', 'ada').mtime).toBe(10);
    vfs.writeFile(root, '/home/ada/todo.txt', 'ada', '!', true, 20);
    expect(vfs.stat(root, '/home/ada/todo.txt', 'ada').mtime).toBe(20);
    vfs.makeDir(root, '/home/ada/new', 'ada', false, 30);
    expect(vfs.stat(root, '/home/ada', 'ada').mtime).toBe(30);
    vfs.remove(root, '/home/ada/new', 'ada', true, 40);
    expect(vfs.stat(root, '/home/ada', 'ada').mtime).toBe(40);
    expect(homeBefore).toBe(0);
  });

  it('makes nested directories with parents and refuses duplicates without it', () => {
    const root = fresh();
    vfs.makeDir(root, '/home/ada/a/b/c', 'ada', true);
    expect(vfs.listDir(root, '/home/ada/a/b', 'ada').map((s) => s.name)).toEqual(['c']);
    expect(code(() => vfs.makeDir(root, '/home/ada/a', 'ada'))).toBe('EEXIST');
    expect(code(() => vfs.makeDir(root, '/home/ada/x/y', 'ada'))).toBe('ENOENT');
  });

  it('only removes a non-empty directory when recursive', () => {
    const root = fresh();
    vfs.writeFile(root, '/home/ada/Documents/a.txt', 'ada', 'hi');
    expect(code(() => vfs.remove(root, '/home/ada/Documents', 'ada'))).toBe('ENOTEMPTY');
    vfs.remove(root, '/home/ada/Documents', 'ada', true);
    expect(code(() => vfs.stat(root, '/home/ada/Documents', 'ada'))).toBe('ENOENT');
    expect(code(() => vfs.remove(root, '/', 'root', true))).toBe('EPERM');
  });

  it('reports the right error for files used as directories and the reverse', () => {
    const root = fresh();
    expect(code(() => vfs.readFile(root, '/home/ada', 'ada'))).toBe('EISDIR');
    expect(code(() => vfs.listDir(root, '/etc/hostname', 'ada'))).toBe('ENOTDIR');
    expect(code(() => vfs.readFile(root, '/etc/hostname/x', 'ada'))).toBe('ENOTDIR');
  });
});

describe('permissions', () => {
  it('stops a regular user writing system files but lets root', () => {
    const root = fresh();
    expect(code(() => vfs.writeFile(root, '/etc/hostname', 'ada', 'pwned'))).toBe('EACCES');
    expect(code(() => vfs.writeFile(root, '/etc/new.conf', 'ada', 'x'))).toBe('EACCES');
    vfs.writeFile(root, '/etc/hostname', 'root', 'tuxbox');
    expect(vfs.readFile(root, '/etc/hostname', 'ada')).toBe('tuxbox');
  });

  it('needs execute permission to walk into a directory', () => {
    const root = fresh();
    vfs.writeFile(root, '/root/secret', 'root', 's3cret');
    expect(code(() => vfs.readFile(root, '/root/secret', 'ada'))).toBe('EACCES');
    expect(vfs.readFile(root, '/root/secret', 'root')).toBe('s3cret');
  });

  it('lets only the owner or root chmod, and honours the new mode', () => {
    const root = fresh();
    vfs.writeFile(root, '/home/ada/diary', 'ada', 'dear diary');
    expect(code(() => vfs.changeMode(root, '/etc/passwd', 'ada', 0o777))).toBe('EPERM');
    vfs.changeMode(root, '/home/ada/diary', 'ada', 0o200);
    expect(code(() => vfs.readFile(root, '/home/ada/diary', 'ada'))).toBe('EACCES');
    expect(code(() => vfs.changeMode(root, '/home/ada/diary', 'ada', 0o1777))).toBe('EINVAL');
  });

  it('lets root execute only files with an execute bit', () => {
    const root = fresh();
    vfs.writeFile(root, '/tmp/run.sh', 'root', 'echo hi');
    const node = vfs.lookup(root, '/tmp/run.sh', 'root');
    expect(vfs.allows(node, 'root', 'x')).toBe(false);
    vfs.changeMode(root, '/tmp/run.sh', 'root', 0o755);
    expect(vfs.allows(node, 'root', 'x')).toBe(true);
  });
});

describe('/dev/null', () => {
  it('accepts writes from anyone and stays empty', () => {
    const root = fresh();
    vfs.writeFile(root, '/dev/null', 'ada', 'discard me');
    vfs.writeFile(root, '/dev/../dev/null', 'ada', 'and me', true);
    expect(vfs.readFile(root, '/dev/null', 'ada')).toBe('');
  });
});
