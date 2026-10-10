import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'learn-linux',
  version: '1.0.0',
  title: 'Learn Linux',
  // fs: lesson setup files and checks, as the learner. lessons: the actions the window and tutor call.
  capabilities: ['fs:read', 'fs:write', 'lessons:read', 'lessons:write'],
  // Starts with the system so an active lesson keeps tracking progress even when its window is closed.
  activation: ['onStartup', 'onApp:learn-linux'],
  contributes: {
    apps: [{
      id: 'learn-linux',
      title: 'Learn Linux',
      icon: 'learn-linux',
      description: 'Short hands-on lessons that check your work as you go.',
    }],
  },
};
