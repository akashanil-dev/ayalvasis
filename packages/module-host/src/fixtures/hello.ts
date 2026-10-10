import { defineModule } from '@ayalvasis/sdk';

export const hello = defineModule({
  manifest: {
    id: 'hello', version: '1.0.0', title: 'Hello', capabilities: [],
    activation: ['onCommand:hello'],
    contributes: { commands: [{ name: 'hello', summary: 'Say hello from a module' }] },
  },
  activate(ctx) {
    ctx.registerCommand({
      name: 'hello', summary: 'Say hello from a module', usage: 'hello',
      run(command) { command.stdout('hello from a module\n'); return 0; },
    });
  },
});
