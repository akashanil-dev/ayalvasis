import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@ayalvasis/system';
import type { ChatMessage, CompletionRequest, Transport } from '@ayalvasis/tutor';
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
    localStorage.setItem('ayalvasis.tutor.autonomy', 'demo');
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Vasi, your Linux tutor' }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'where am I?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('pwd', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText(/Ran in Vasi/).parentElement?.textContent).toContain('$ pwd\n/home/ada');
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
    await screen.findByText('Terminal');
    fireEvent.click(screen.getByRole('button', { name: 'Ask Vasi, your Linux tutor' }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'where is the terminal?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Here!')).toBeTruthy();
    expect(document.querySelector('.tutor-pointer')).not.toBeNull();
    expect(screen.getByText('Terminal').closest('button')?.classList.contains('tutor-raised')).toBe(true);
  });

  it('changes what the tutor may do with the autonomy switch', async () => {
    const system = await boot();
    const transport = scripted({ role: 'assistant', content: 'a' }, { role: 'assistant', content: 'b' });
    render(<Desktop system={system} tutor={transport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Vasi, your Linux tutor' }));
    const ask = async (text: string) => {
      fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    };
    await ask('one');
    fireEvent.click(screen.getByRole('radio', { name: 'Drive' }));
    await ask('two');
    const offered = transport.requests.map((request) => request.tools.map((tool) => tool.function.name));
    expect(offered[0]).not.toContain('write_file');
    expect(offered[1]).toContain('write_file');
    expect(localStorage.getItem('ayalvasis.tutor.autonomy')).toBe('drive');
  });

  it('shows the service error in plain words', async () => {
    const system = await boot();
    render(<Desktop system={system} tutor={scripted()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Vasi, your Linux tutor' }));
    fireEvent.change(screen.getByLabelText('Ask Vasi'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The tutor service is not reachable.');
  });

  it('offers help after two failed commands, without calling the AI until asked', async () => {
    const system = await boot();
    const transport = scripted({ role: 'assistant', content: 'You need sudo for that file.' });
    render(<Desktop system={system} tutor={transport} />);
    const terminal = await system.createTerminal();
    await act(async () => {
      await terminal.run('cat /etc/shadow');
      await terminal.run('cat /etc/shadow');
    });
    const nudge = await screen.findByRole('button', { name: /didn't work either/ });
    expect(transport.requests).toHaveLength(0);
    fireEvent.click(nudge);
    expect(await screen.findByText('You need sudo for that file.')).toBeTruthy();
  });
});
