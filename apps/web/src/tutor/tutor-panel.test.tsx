import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import type { ChatMessage, CompletionRequest, Transport } from '@tuxos/tutor';
import { afterEach, describe, expect, it } from 'vitest';
import { Desktop } from '../screens/Desktop';
import { manifest as terminalManifest } from '../../../../modules/terminal/src/manifest';

type Assistant = Extract<ChatMessage, { role: 'assistant' }>;

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

function scripted(...replies: Assistant[]): Transport & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(structuredClone(request));
      const reply = replies.shift();
      if (!reply) throw new Error('The tutor service is not reachable.');
      return reply;
    },
  };
}

const uses = (name: string, args: Record<string, unknown>): Assistant => ({
  role: 'assistant', content: null,
  tool_calls: [{ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

async function boot(): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    modules: [{
      manifest: terminalManifest,
      load: () => import('../../../../modules/terminal/src/index').then((m) => m.terminal),
    }],
  });
  await system.boot('ada');
  return system;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('tutor panel', () => {
  it('answers a question, showing what the tutor did on the way', async () => {
    const system = await boot();
    const transport = scripted(
      uses('run_command', { command: 'pwd' }),
      { role: 'assistant', content: 'Use `pwd` to see **where** you are.' },
    );
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'where am I?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('pwd', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText(/Checked quietly/).parentElement?.textContent).toContain('$ pwd\n/home/ada');
    expect(screen.getByText('where am I?')).toBeTruthy();
    expect(screen.getByText('where', { selector: 'strong' })).toBeTruthy();
  });

  it('points at a desktop icon with a highlight', async () => {
    const system = await boot();
    const transport = scripted(
      uses('point_at', { target: 'app:terminal', note: 'Here!' }),
      { role: 'assistant', content: 'There.' },
    );
    render(<Desktop system={system} tutor={transport} />);
    await screen.findByText('Terminal', {}, { timeout: 4000 });
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'where is the terminal?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Here!')).toBeTruthy();
    expect(document.querySelector('.tutor-pointer')).not.toBeNull();
    expect(screen.getByText('Terminal').closest('button')?.classList.contains('tutor-raised')).toBe(true);
  });

  it('asks the learner for sudo with their password, and lets them revoke it', async () => {
    const system = await boot();
    const transport = scripted(
      uses('request_sudo', { reason: 'To show you how /etc/shadow stores passwords.' }),
      { role: 'assistant', content: 'Thanks!' },
    );
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'show me shadow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const dialog = await screen.findByRole('dialog', { name: 'Authentication required' });
    expect(dialog.textContent).toContain('To show you how /etc/shadow stores passwords.');
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Type your password');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    expect(await screen.findByText('Thanks!')).toBeTruthy();
    expect(screen.getByText(/Asked for sudo: you said yes/)).toBeTruthy();
    expect(system.tutor().can('user:switch')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    expect(system.tutor().can('user:switch')).toBe(false);
  });

  it('tells Vasi when the learner denies sudo', async () => {
    const system = await boot();
    const transport = scripted(
      uses('request_sudo', { reason: 'To fix your system.' }),
      { role: 'assistant', content: 'Fair enough, I am but a humble penguin.' },
    );
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'fix it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    expect(await screen.findByText(/humble penguin/)).toBeTruthy();
    expect(transport.requests[1]!.messages.at(-1)).toMatchObject({
      role: 'tool', content: expect.stringContaining('said no'),
    });
    expect(system.tutor().can('user:switch')).toBe(false);
  });

  it('shows a Stop control while Vasi works, and stops when pressed', async () => {
    const system = await boot();
    let release: (reply: Assistant) => void = () => undefined;
    const transport: Transport = { complete: () => new Promise<Assistant>((resolve) => { release = resolve; }) };
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'set up an exercise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(await screen.findByRole('button', { name: /Stop/ }));
    await act(async () => { release(uses('look_at_screen', {})); });
    expect(await screen.findByText('Stopped. You have control again.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull());
  });

  it('shows the service error in plain words', async () => {
    const system = await boot();
    render(<Desktop system={system} tutor={scripted()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The tutor service is not reachable.');
  });

  it('offers help after two failed commands, without calling the AI until asked', async () => {
    const system = await boot();
    const transport = scripted({ role: 'assistant', content: 'You need sudo for that file.' });
    render(<Desktop system={system} tutor={transport} />);
    await screen.findByRole('button', { name: 'Ask Vasi, your Linux tutor' }, { timeout: 4000 });
    const terminal = await system.createTerminal();
    await act(async () => {
      await terminal.run('cat /etc/shadow');
      await terminal.run('cat /etc/shadow');
    });
    const nudge = await screen.findByRole('button', { name: /didn't work either/ }, { timeout: 4000 });
    expect(transport.requests).toHaveLength(0);
    fireEvent.click(nudge);
    expect(await screen.findByText('You need sudo for that file.')).toBeTruthy();
  });
});
