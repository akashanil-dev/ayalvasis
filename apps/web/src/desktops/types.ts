import type { SessionState } from '@tuxos/kernel';
import type { AppContribution } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
import type { ComponentType } from 'react';
import type { Insets } from '../desktop/WindowFrame';
import type { MenuItem } from './shared/Menu';

export type App = AppContribution & { moduleId: string };
export type PowerAction = 'lock' | 'logout' | 'restart' | 'shutdown';

/** What every desktop environment's shell (its panels, launcher and overview) gets to work with. */
export interface ShellProps {
  system: SystemClient;
  apps: App[];
  session: SessionState;
  user: string;
  open(appId: string): void;
  /** Bring a window forward, restoring it if minimized. */
  activate(windowId: string): void;
  minimize(windowId: string): void;
  power(action: PowerAction): void;
  /** The desktop asks the shell to toggle its launcher (Super key). */
  launcherRequest: number;
}

/**
 * A desktop environment: its shell plus the few things the shared desktop needs to know about it.
 * Adding one means writing a Shell component and registering it in registry.ts.
 */
export interface DesktopEnvironment {
  id: string;
  /** Space its panels take; windows stay out of it. */
  insets: Insets;
  decoration: 'breeze' | 'adwaita';
  desktopIcons: boolean;
  Shell: ComponentType<ShellProps>;
  /** Right-click menu on the empty desktop. */
  desktopMenu(actions: { open(appId: string): void }): MenuItem[];
  /** Shown once, the first time a learner logs in to it. */
  welcome: string;
}
