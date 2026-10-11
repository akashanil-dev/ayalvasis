import { activateAICourse, type Course } from '@tuxos/lessons';
import type { ModuleDefinition } from '@tuxos/sdk';
import courseData from './course.json';
import { manifest } from './manifest';

export { manifest } from './manifest';

export const course = courseData as Course;

export const learnLinux: ModuleDefinition = {
  manifest,
  activate: (ctx) => activateAICourse(ctx, course, {
    id: 'linux-certifier',
    title: 'Linux Certification Trainer',
    specialty: 'An industry Linux administrator and certification assessor who teaches safe operations, troubleshooting, shell fluency, permissions, networking, and production habits.',
    level: 'beginner to advanced',
    scenarioFocus: 'real incidents, on-call runbooks, server hardening, log investigation, and certification-style practical labs',
  }, { requireAI: true }),
};

export default learnLinux;
