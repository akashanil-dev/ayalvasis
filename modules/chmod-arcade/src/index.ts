import { activateAICourse } from '@tuxos/lessons';
import type { ModuleDefinition } from '@tuxos/sdk';
import { course } from './course';
import { manifest } from './manifest';

export { manifest } from './manifest';

// The game is entirely in its window; its best score is a file in the learner's home.
export { course } from './course';

export const chmodArcade: ModuleDefinition = {
  manifest,
  activate(ctx) {
    return activateAICourse(ctx, course, {
      id: 'security-permissions-trainer',
      title: 'Linux Security Trainer',
      specialty: 'an industry Linux security engineer and certification tutor',
      level: 'beginner to advanced',
      scenarioFocus: 'least privilege, deployment permissions, service accounts, secure file handling, and incident response',
    });
  },
};

export default chmodArcade;
