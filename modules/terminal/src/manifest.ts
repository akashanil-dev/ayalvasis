import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'terminal',
  version: '1.0.0',
  title: 'Terminal',
  capabilities: [],
  activation: ['onApp:terminal', 'onCommand:clear'],
  contributes: {
    apps: [{
      id: 'terminal',
      title: 'Terminal',
      icon: 'terminal',
      category: 'System',
      description: 'Type commands into a bash shell.',
    }],
    commands: [
      { name: 'clear', summary: 'Clear the terminal screen' },
      { name: 'hint', summary: 'Ask the active trainer for a hint (/hint)' },
      { name: 'answer', summary: 'Show the detailed answer for the active task (/answer)' },
      { name: 'task', summary: 'Show the current industry task (/task)' },
      { name: 'next', summary: 'Show the next task (/next)' },
    ],
  },
};
