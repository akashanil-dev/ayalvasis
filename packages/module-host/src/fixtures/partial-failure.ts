import { defineModule } from '@tuxos/sdk';

export const partialFailure = defineModule({
  manifest: {
    id: 'partial-failure', version: '1.0.0', title: 'Partial failure', capabilities: ['fs:read'],
    activation: ['onStartup'], contributes: {},
  },
  activate(ctx) {
    ctx.registerAction({
      type: 'partial-failure.read', capability: 'fs:read', description: 'Temporary action',
      mutates: false, run: ({ fs }) => fs.read('/etc/hostname'),
    });
    throw new Error('partial activation failed');
  },
});
