import type { ModuleManifest } from '@ayalvasis/sdk';

export const manifest: ModuleManifest = {
  id: 'learn-docker',
  version: '1.0.0',
  title: 'Learn Docker',
  // The course needs fs and lessons; user:switch lets the pretend Docker daemon keep its state as root in
  // /var/lib/docker, like the real one.
  capabilities: ['fs:read', 'fs:write', 'lessons:read', 'lessons:write', 'user:switch'],
  activation: ['onStartup', 'onApp:learn-docker', 'onCommand:docker', 'onCommand:curl'],
  contributes: {
    apps: [{
      id: 'learn-docker',
      title: 'Learn Docker',
      icon: 'learn-docker',
      description: 'Run containers, publish ports and clean up, with a simulated Docker.',
    }],
    commands: [
      { name: 'docker', summary: 'Run and manage containers (simulated Docker)' },
      { name: 'curl', summary: 'Fetch a URL (only localhost works here)' },
    ],
  },
};
