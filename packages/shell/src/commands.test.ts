import { describe, expect, it } from 'vitest';
import { createKernel } from '@ayalvasis/kernel';
import { createShell, type CommandDefinition } from './index';

const make = () => createShell(createKernel({ username: 'ada' }));

async function run(shell: ReturnType<typeof make>, line: string) {
  return shell.run(line);
}

describe('built-in commands', () => {
  it('covers navigation, listing, environment and help', async () => {
    const shell = make();
    expect((await run(shell, 'pwd')).stdout).toBe('/home/ada\n');
    await run(shell, 'mkdir -p work/nested');
    await run(shell, 'touch work/a work/.hidden');
    expect((await run(shell, 'ls work')).stdout).toBe('a nested\n');
    expect((await run(shell, 'ls -a -1 work')).stdout).toContain('.hidden\n');
    expect((await run(shell, 'ls -l work/a')).stdout).toMatch(/^-rw-r--r-- ada 0 a\n$/);
    await run(shell, 'cd work');
    expect((await run(shell, 'cd -')).stdout).toBe('/home/ada\n');
    expect((await run(shell, 'whoami')).stdout).toBe('ada\n');
    await run(shell, 'export COURSE=linux');
    expect((await run(shell, 'env')).stdout).toContain('COURSE=linux\n');
    expect((await run(shell, 'help')).stdout).toContain('ls\tList directory contents');
  });

  it('covers file creation, reading, copying, moving and removal', async () => {
    const shell = make();
    await run(shell, 'mkdir -p source/deep; echo data > source/deep/file');
    expect((await run(shell, 'cat source/deep/file')).stdout).toBe('data\n');
    expect((await run(shell, 'cat missing')).code).toBe(1);
    await run(shell, 'cp -r source copy');
    expect((await run(shell, 'cat copy/deep/file')).stdout).toBe('data\n');
    await run(shell, 'mv copy moved');
    expect((await run(shell, 'cat moved/deep/file')).stdout).toBe('data\n');
    expect((await run(shell, 'rm -r moved')).code).toBe(0);
    expect((await run(shell, 'rm -f missing')).code).toBe(0);
  });

  it('covers chmod octal and symbolic modes', async () => {
    const shell = make();
    await run(shell, 'touch mode');
    await run(shell, 'chmod 777 mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-rwxrwxrwx/);
    await run(shell, 'chmod go-w mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-rwxr-xr-x/);
    await run(shell, 'chmod a=r mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-r--r--r--/);
    await run(shell, 'chmod u+x mode');
    expect((await run(shell, 'ls -l mode')).stdout).toMatch(/^-r-xr--r--/);
  });

  it('covers text command options', async () => {
    const shell = make();
    const command: CommandDefinition = {
      name: 'fixture', summary: 'fixture', usage: 'fixture',
      run(ctx) { ctx.stdout('10 apple\n2 Banana\n2 Banana\n'); return 0; },
    };
    shell.register(command);
    await run(shell, 'fixture > words');
    expect((await run(shell, 'echo -n ok')).stdout).toBe('ok');
    expect((await run(shell, 'head -n 2 words')).stdout).toBe('10 apple\n2 Banana\n');
    expect((await run(shell, 'tail -n 1 words')).stdout).toBe('2 Banana\n');
    expect((await run(shell, 'wc -l -w -c words')).stdout).toBe('3 6 27 words\n');
    expect((await run(shell, 'grep -i -n Banana words')).stdout).toBe('2:2 Banana\n3:2 Banana\n');
    expect((await run(shell, 'grep -v -c Banana words')).stdout).toBe('1\n');
    await run(shell, 'echo Banana > other');
    expect((await run(shell, 'grep -c Banana words other')).stdout).toBe('words:2\nother:1\n');
    expect((await run(shell, 'grep -r -n apple .')).stdout).toContain('apple');
    expect((await run(shell, 'sort -n words')).stdout).toBe('2 Banana\n2 Banana\n10 apple\n');
    expect((await run(shell, 'uniq -c < words')).stdout).toBe('1 10 apple\n2 2 Banana\n');
  });

  it('supports true and false', async () => {
    const shell = make();
    expect((await run(shell, 'true')).code).toBe(0);
    expect((await run(shell, 'false')).code).toBe(1);
  });
});
