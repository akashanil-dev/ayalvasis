import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@ayalvasis/system';
import { describe, expect, it } from 'vitest';
import { learnLinux } from '../../../modules/learn-linux/src/index';
import type { ChatMessage, CompletionRequest, ToolCall, Transport } from './protocol';
import { httpTransport } from './protocol';
import { TutorSession, type TutorEvent } from './session';
import type { Autonomy } from './tools';

type Assistant = Extract<ChatMessage, { role: 'assistant' }>;

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

let callId = 0;
const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `call-${++callId}`, type: 'function', function: { name, arguments: JSON.stringify(args) },
});
const says = (content: string): Assistant => ({ role: 'assistant', content });
const uses = (...calls: ToolCall[]): Assistant => ({ role: 'assistant', content: null, tool_calls: calls });

/** A fake model that replies from a script and remembers every request it was sent. */
function scripted(...replies: Assistant[]): Transport & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(structuredClone(request));
      const reply = replies.shift();
      if (!reply) throw new Error('script ran out');
      return reply;
    },
  };
}

async function setup(transport: Transport, autonomy: Autonomy = 'guide') {
  const system: SystemClient = createLocalSystem({
    storage: memory(), modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
  });
  await system.boot('ada');
  const pointed: string[] = [];
  const tutor = new TutorSession({
    access: system.tutor(), transport, autonomy, ui: { pointAt: (target) => pointed.push(target) },
  });
  const events: TutorEvent[] = [];
  tutor.on((event) => events.push(event));
  return { system, tutor, events, pointed };
}

const toolResults = (events: TutorEvent[]) => events.flatMap((event) => (event.type === 'tool' ? [event] : []));

describe('TutorSession', () => {
  it('lets the model look around with tools, then answers', async () => {
    const transport = scripted(uses(call('look_at_screen')), says('You have no windows open yet.'));
    const { tutor, events } = await setup(transport);
    await tutor.ask('What is on my screen?');
    expect(toolResults(events)[0]).toMatchObject({ name: 'look_at_screen', result: { windows: [] } });
    expect(events.at(-2)).toEqual({ type: 'message', role: 'assistant', text: 'You have no windows open yet.' });
    expect(events.at(-1)).toEqual({ type: 'busy', busy: false });
    const second = transport.requests[1]!.messages;
    expect(second.at(-1)).toMatchObject({ role: 'tool', content: expect.stringContaining('"windows":[]') });
  });

  it('sends a snapshot of the learner\'s recent commands with the latest question only', async () => {
    const transport = scripted(says('one'), says('two'));
    const { system, tutor } = await setup(transport);
    await (await system.createTerminal()).run('cat /etc/shadow');
    await tutor.ask('Why did that fail?');
    await tutor.ask('And now?');
    const [first, second] = transport.requests.map((request) => request.messages);
    const expected = '$ cat /etc/shadow  -> exit 1, error: cat: /etc/shadow: Permission denied';
    expect(first![0]).toMatchObject({ content: expect.stringContaining(expected) });
    expect(second![0]).toEqual({ role: 'user', content: 'Why did that fail?' });
    expect(second!.at(-1)).toMatchObject({ content: expect.stringContaining('<system_snapshot>') });
  });

  it('offers tools by autonomy level and refuses ones above it', async () => {
    const transport = scripted(uses(call('run_command', { command: 'ls' })), says('ok'));
    const { tutor, events } = await setup(transport, 'guide');
    await tutor.ask('show me ls');
    const offered = transport.requests[0]!.tools.map((tool) => tool.function.name);
    expect(offered).toContain('read_file');
    expect(offered).toContain('learn-linux__status');
    expect(offered).not.toContain('run_command');
    expect(offered).not.toContain('learn-linux__start');
    expect(toolResults(events)[0]?.result).toEqual({
      error: 'run_command needs the "demo" autonomy level; the learner set "guide".',
    });
  });

  it('demonstrates commands in its own shell without sudo, and without doing the learner\'s lesson', async () => {
    const transport = scripted(
      uses(call('learn-linux__start', { lesson: 'first-words' })),
      uses(call('run_command', { command: 'whoami' }), call('run_command', { command: 'sudo cat /etc/shadow' })),
      says('Now you try whoami.'),
    );
    const { system, tutor, events } = await setup(transport, 'drive');
    await tutor.ask('start the first lesson and show me whoami');
    const [start, whoami, sudo] = toolResults(events);
    expect(start?.result).toMatchObject({ ok: true });
    expect(whoami?.result).toMatchObject({ exit_code: 0, stdout: 'ada\n' });
    expect(sudo?.result).toMatchObject({ exit_code: 1, stderr: 'cat: /etc/shadow: Operation not permitted\n' });
    const status = await system.dispatch<{ active: { step: { id: string } } }>('learn-linux.status', {});
    expect(status.ok && status.value.active.step.id).toBe('whoami');
  });

  it('opens apps and points at things on screen', async () => {
    const transport = scripted(
      uses(call('open_app', { app: 'learn-linux' }), call('point_at', { target: 'app:files' })),
      says('There.'),
    );
    const { system, tutor, pointed } = await setup(transport);
    await tutor.ask('where are my lessons?');
    expect((await system.session()).windows.map((window) => window.appId)).toEqual(['learn-linux']);
    expect(pointed).toEqual(['app:files']);
  });

  it('cannot write files at the guide level even if the kernel is asked directly', async () => {
    const { system } = await setup(scripted());
    expect(await system.tutor().dispatch('fs.write', { path: '/home/ada/x', content: '' })).toMatchObject({
      ok: false, error: { code: 'EPERM' },
    });
  });

  it('reports a failing model service and recovers for the next question', async () => {
    const transport: Transport = { complete: async () => { throw new Error('quota exceeded'); } };
    const { tutor, events } = await setup(transport);
    await tutor.ask('hello?');
    expect(events).toContainEqual({ type: 'error', message: 'quota exceeded' });
    expect(events.at(-1)).toEqual({ type: 'busy', busy: false });
  });

  it('stops a model that keeps calling tools', async () => {
    const replies = Array.from({ length: 8 }, () => uses(call('look_at_screen')));
    const { tutor, events } = await setup(scripted(...replies));
    await tutor.ask('loop forever');
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error', message: expect.stringContaining('too many steps'),
    }));
  });

  it('never sends a tool result without the request that asked for it, even after trimming', async () => {
    const replies: Assistant[] = [];
    for (let index = 0; index < 12; index += 1) replies.push(uses(call('look_at_screen')), says(`answer ${index}`));
    const transport = scripted(...replies);
    const { tutor } = await setup(transport);
    for (let index = 0; index < 12; index += 1) await tutor.ask(`question ${index}`);
    for (const request of transport.requests) expect(request.messages[0]?.role).toBe('user');
  });
});

describe('httpTransport', () => {
  it('returns the assistant message and surfaces server errors in plain words', async () => {
    const reply = { message: { role: 'assistant', content: 'hi' } };
    const ok = httpTransport('/api/tutor', async () => Response.json(reply));
    expect(await ok.complete({ messages: [], tools: [] })).toEqual({ role: 'assistant', content: 'hi' });

    const failing = httpTransport('/api/tutor', async () => Response.json(
      { error: 'Tutor not configured' }, { status: 503 },
    ));
    await expect(failing.complete({ messages: [], tools: [] })).rejects.toThrow('Tutor not configured');

    const offline = httpTransport('/api/tutor', async () => { throw new TypeError('fetch failed'); });
    await expect(offline.complete({ messages: [], tools: [] })).rejects.toThrow('not reachable');
  });
});
