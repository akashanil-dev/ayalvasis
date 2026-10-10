import { activateAICourse, type Course } from '@tuxos/lessons';
import type { ModuleContext, ModuleDefinition } from '@tuxos/sdk';
import { curl, docker } from './cli';
import courseData from './course.json';
import { DockerEngine, type EngineState, type Output } from './engine';
import { manifest } from './manifest';

export { manifest } from './manifest';

export const course = courseData as Course;

const STATE_DIR = '/var/lib/docker';
const STATE_FILE = `${STATE_DIR}/engine.json`;

interface Printer {
  args: string[];
  stdout(text: string): void;
  stderr(text: string): void;
}

export const learnDocker: ModuleDefinition = {
  manifest,
  activate(ctx) {
    const engine = new DockerEngine(load(ctx));
    const command = (name: string, run: (args: string[]) => Output) => ctx.registerCommand({
      name,
      summary: manifest.contributes.commands!.find((each) => each.name === name)!.summary,
      usage: `${name} ...`,
      run(shell: Printer) {
        const result = run(shell.args);
        shell.stdout(result.stdout);
        shell.stderr(result.stderr);
        save(ctx, engine.state);
        return result.code;
      },
    });
    command('docker', (args) => docker(engine, args));
    command('curl', (args) => curl(engine, args));
    return activateAICourse(ctx, course, {
      id: 'docker-platform-engineer',
      title: 'Docker Platform Engineering Trainer',
      specialty: 'A production platform engineer who teaches container lifecycle, images, networking, observability, security, and incident response.',
      level: 'beginner to advanced',
      scenarioFocus: 'deployment tickets, broken services, container debugging, release hygiene, and production operations',
    });
  },
};

export default learnDocker;

function load(ctx: ModuleContext): EngineState | undefined {
  const saved = ctx.dispatch<string>('fs.read', { path: STATE_FILE }, { user: 'root' });
  if (!saved.ok) return undefined;
  try {
    return JSON.parse(saved.value) as EngineState;
  } catch {
    ctx.log(`ignoring unreadable ${STATE_FILE}`);
    return undefined;
  }
}

function save(ctx: ModuleContext, state: EngineState): void {
  if (!ctx.dispatch('fs.stat', { path: STATE_DIR }, { user: 'root' }).ok) {
    ctx.dispatch('fs.mkdir', { path: STATE_DIR, parents: true }, { user: 'root' });
    // Like the real one, the daemon's directory is root's business: learners get "Permission denied".
    ctx.dispatch('fs.chmod', { path: STATE_DIR, mode: 0o710 }, { user: 'root' });
  }
  ctx.dispatch('fs.write', { path: STATE_FILE, content: JSON.stringify(state) }, { user: 'root' });
}
