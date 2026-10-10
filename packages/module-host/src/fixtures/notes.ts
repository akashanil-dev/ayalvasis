import type { ActionContext } from '@ayalvasis/kernel';
import { defineModule, type ModuleContext } from '@ayalvasis/sdk';

export function addNote(ctx: ModuleContext, text: string) {
  return ctx.dispatch('notes.add', { text });
}

export const notes = defineModule({
  manifest: {
    id: 'notes', version: '1.0.0', title: 'Notes', capabilities: ['fs:write'],
    requires: ['hello'], activation: ['onApp:notes'],
    contributes: {
      apps: [{ id: 'notes', title: 'Notes', icon: 'note', description: 'Write a note' }],
    },
  },
  activate(ctx) {
    ctx.registerAction({
      type: 'notes.add', capability: 'fs:write', description: 'Append a note', mutates: true,
      run(actionContext: ActionContext, payload) {
        const text = typeof payload === 'string' ? payload : String((payload as { text?: unknown }).text ?? '');
        const home = actionContext.state.users[actionContext.user]!.home;
        actionContext.fs.write(`${home}/notes.txt`, `${text}\n`, { append: true });
      },
    });
  },
});
