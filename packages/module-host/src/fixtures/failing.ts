import { defineModule } from '@tuxos/sdk';

export const failing = defineModule({
  manifest: {
    id: 'failing', version: '1.0.0', title: 'Failing', capabilities: [], activation: ['onStartup'],
    contributes: {},
  },
  activate() {
    throw new Error('fixture failed');
  },
});
