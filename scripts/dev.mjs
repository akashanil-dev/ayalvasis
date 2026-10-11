import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'api'], { stdio: 'inherit', env: process.env }),
  spawn(npm, ['run', 'dev', '--workspace', '@tuxos/web'], { stdio: 'inherit', env: process.env }),
];
let shuttingDown = false;

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGINT');
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) child.on('exit', (code, signal) => {
  if (!shuttingDown && (code ?? 0) !== 0) {
    console.error(`development process stopped${signal ? ` (${signal})` : ` with code ${code}`}`);
    stop(code ?? 1);
  }
});

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
