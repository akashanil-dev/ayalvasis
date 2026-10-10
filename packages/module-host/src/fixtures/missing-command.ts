import { defineModule } from '@tuxos/sdk';

export const missingCommand = defineModule({
  manifest: {
    id: 'missing-command', version: '1.0.0', title: 'Missing command', capabilities: [],
    activation: ['onCommand:missing'],
    contributes: { commands: [{ name: 'missing', summary: 'Not actually installed' }] },
  },
  activate() {},
});
