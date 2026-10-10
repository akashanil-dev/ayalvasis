import { describe, expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createShell } from './index';

const make = () => createShell(createKernel({ username: 'ada' }));

describe('executor', () => {
  it('routes learning slash commands while preserving ordinary absolute paths', async () => {
    const shell = make();
    shell.register({
      name: 'hint', summary: 'hint', usage: '/hint',
      run: (ctx) => { ctx.stdout('try pwd\n'); return 0; },
    });
    await expect(shell.run('/hint')).resolves.toMatchObject({ code: 0, stdout: 'try pwd\n' });
    await expect(shell.run('cat /etc/motd')).resolves.toMatchObject({ code: 0 });
  });

  it('expands status and exported variables at execution time', async () => {
    const shell = make();
    const result = await shell.run('cat /nope; echo $?');
    expect(result.stdout).toBe('1\n');
    expect(result.code).toBe(0);
    expect((await shell.run('export COURSE=linux; echo $COURSE')).stdout).toBe('linux\n');
  });

  it('updates status through &&, || and ; chains', async () => {
    const shell = make();
    expect((await shell.run('true && echo $?')).stdout).toBe('0\n');
    expect((await shell.run('false || echo $?')).stdout).toBe('1\n');
    expect((await shell.run('false && echo bad; echo $?')).stdout).toBe('1\n');
  });

  it('only expands unquoted tilde, glob characters and variables', async () => {
    const shell = make();
    await shell.run('touch alpha.txt beta.txt');
    expect((await shell.run('echo *.txt')).stdout).toBe('alpha.txt beta.txt\n');
    expect((await shell.run('echo "*"')).stdout).toBe('*\n');
    expect((await shell.run("echo '*' ")).stdout).toBe('*\n');
    expect((await shell.run('echo ~')).stdout).toBe('/home/ada\n');
    expect((await shell.run('echo "~"')).stdout).toBe('~\n');
    expect((await shell.run('echo $')).stdout).toBe('$\n');
    expect((await shell.run('echo "$"')).stdout).toBe('$\n');
    expect((await shell.run('echo $.')).stdout).toBe('$.\n');
    expect((await shell.run('echo a$')).stdout).toBe('a$\n');
  });

  it('rejects bad substitutions with a non-zero status and no execution', async () => {
    const shell = make();
    const result = await shell.run('touch marker; echo ${1bad}');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('bash: ${1bad}: bad substitution');
    expect((await shell.run('cat marker')).code).toBe(1);
  });

  it('connects pipelines and performs filesystem redirections', async () => {
    const shell = make();
    const pipeline = await shell.run('echo b; echo a');
    expect(pipeline.stdout).toBe('b\na\n');
    expect((await shell.run('echo saved > note && cat < note')).stdout).toBe('saved\n');
    expect((await shell.run('echo again >> note; cat note')).stdout).toBe('saved\nagain\n');
    const missing = await shell.run('cat < missing');
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('No such file or directory');
  });

  it('returns syntax status 2 without executing a command', async () => {
    for (const line of ['| ls', 'ls &&', 'echo >', 'echo "unterminated']) {
      const shell = make();
      const result = await shell.run(`touch marker; ${line}`);
      expect(result.code).toBe(2);
      expect((await shell.run('cat marker')).stdout).toBe('');
    }
  });

  it('passes the command user through sudo', async () => {
    const shell = make();
    expect((await shell.run('whoami')).stdout).toBe('ada\n');
    expect((await shell.run('sudo whoami')).stdout).toBe('root\n');
  });

  it('honors tutor actor capability grants', async () => {
    const kernel = createKernel({ username: 'ada' });
    const shell = createShell(kernel, { actor: { kind: 'tutor', id: 't' } });
    const denied = await shell.run('touch note');
    expect(denied.code).toBe(1);
    expect(denied.stderr).toBe(
      "touch: cannot touch 'note': Operation not permitted\n",
    );
    kernel.grant({ kind: 'tutor', id: 't' }, ['fs:*']);
    expect((await shell.run('touch note')).code).toBe(0);
  });

  it('fails a protected redirection without writing the file', async () => {
    const shell = make();
    const result = await shell.run('echo x > /etc/f');
    expect(result.code).toBe(1);
    expect((await shell.run('cat /etc/f')).code).toBe(1);
  });

  it('rejects duplicate command registration', () => {
    const shell = make();
    expect(() => shell.register({
      name: 'ls', summary: 'x', usage: 'ls', run: () => 0,
    })).toThrow('command already registered: ls');
  });
});
