import { builtinCommands, type CommandDefinition } from './commands';

/**
 * The commands installed on the system. Every shell (one per terminal window) shares one registry,
 * so a command a module installs is available in all of them, while each keeps its own cwd and env.
 */
export interface CommandRegistry {
  register(command: CommandDefinition): void;
  unregister(name: string): void;
  get(name: string): CommandDefinition | undefined;
  list(): CommandDefinition[];
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, CommandDefinition>();
  const registry: CommandRegistry = {
    register(command) {
      if (commands.has(command.name)) throw new Error(`command already registered: ${command.name}`);
      commands.set(command.name, command);
    },
    get: (name) => commands.get(name),
    unregister: (name) => { commands.delete(name); },
    list: () => [...commands.values()],
  };
  for (const command of builtinCommands()) registry.register(command);
  return registry;
}
