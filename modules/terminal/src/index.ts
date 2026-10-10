import type { ModuleDefinition } from '@tuxos/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

// The escape sequence GNU `clear` prints: cursor home, erase the screen, erase the scrollback.
export const CLEAR_SEQUENCE = '\x1b[H\x1b[2J\x1b[3J';

export const terminal: ModuleDefinition = {
  manifest,
  activate(ctx) {
    ctx.registerCommand({
      name: 'clear',
      summary: 'Clear the terminal screen',
      usage: 'clear',
      run(command: { stdout(text: string): void }) {
        command.stdout(CLEAR_SEQUENCE);
        return 0;
      },
    });
  },
};

export default terminal;
