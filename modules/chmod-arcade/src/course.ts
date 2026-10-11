import type { Course } from '@tuxos/lessons';

/** Reviewed offline fallback used when the chmod trainer cannot reach the AI service. */
export const course: Course = {
  id: 'chmod-arcade',
  title: 'Secure Linux Permissions',
  summary: 'Practice least-privilege file permissions through deployment and incident-response scenarios.',
  lessons: [
    {
      id: 'permission-basics', title: 'Protect a deployment artifact',
      story: 'A release engineer found a private deployment manifest readable by every user on the host.',
      setup: { files: { '~/deploy.env': 'DATABASE_URL= sandbox\n' } },
      steps: [{ id: 'lock-manifest', task: 'Make deploy.env readable and writable only by its owner, then verify the result with ls -l.', hints: ['The owner-only read/write mode is 600.', 'Use chmod 600 ~/deploy.env, then inspect it with ls -l ~/deploy.env.', 'The permission string should begin -rw-------.'], check: { mode: { path: '~/deploy.env', is: 'rw-------' } }, explain: 'Mode 600 prevents group and other users from reading deployment secrets.' }],
      solution: ['chmod 600 ~/deploy.env', 'ls -l ~/deploy.env'],
    },
    {
      id: 'service-executable', title: 'Ship a safe service script',
      story: 'A service account needs to execute a health check, while the team must still be able to read it.',
      setup: { files: { '~/healthcheck.sh': '#!/bin/sh\necho healthy\n' } },
      steps: [{ id: 'script-mode', task: 'Make healthcheck.sh executable by its owner and readable/executable by the group, with no access for others. Verify with ls -l.', hints: ['The target mode is 750.', 'Use chmod 750 ~/healthcheck.sh.', 'Check for -rwxr-x--- in ls -l output.'], check: { mode: { path: '~/healthcheck.sh', is: 'rwxr-x---' } }, explain: 'Mode 750 gives the owner full control, the group read/execute access, and everyone else no access.' }],
      solution: ['chmod 750 ~/healthcheck.sh', 'ls -l ~/healthcheck.sh'],
    },
  ],
};
