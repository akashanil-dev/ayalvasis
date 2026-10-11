import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'chmod-arcade',
  version: '1.0.0',
  title: 'chmod Arcade',
  capabilities: ['fs:read', 'fs:write', 'lessons:read', 'lessons:write'],
  activation: ['onApp:chmod-arcade'],
  contributes: {
    apps: [{
      id: 'chmod-arcade',
      title: 'chmod Arcade',
      icon: 'chmod-arcade',
      category: 'Games',
      description: 'A 60-second game: turn rwx permissions into numbers and back.',
    }],
  },
};
