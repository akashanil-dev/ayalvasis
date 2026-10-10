import type { ModuleManifest } from '@ayalvasis/sdk';

export const manifest: ModuleManifest = {
  id: 'editor',
  version: '1.0.0',
  title: 'Text Editor',
  capabilities: [],
  activation: ['onApp:editor'],
  contributes: {
    apps: [{
      id: 'editor',
      title: 'Text Editor',
      icon: 'editor',
      description: 'Open, change and save text files.',
    }],
  },
};
