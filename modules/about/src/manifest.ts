import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'about',
  version: '1.0.0',
  title: 'About this system',
  capabilities: [],
  activation: ['onApp:about'],
  contributes: {
    apps: [{
      id: 'about',
      title: 'About this system',
      icon: 'about',
      category: 'System',
      description: 'Learn about this pretend Linux system.',
    }],
    commands: [{ name: 'uname', summary: 'Print the system name' }],
  },
};
