import type { SystemClient } from '@tuxos/system';

export interface GreeterProps {
  system: SystemClient;
  /** The account saved in this browser, if any. */
  savedUser: string | null;
  /** The desktop session that will start, chosen on the login screen. */
  desktop: string;
  onDesktop(desktop: string): void;
  /** Boot the system as this user. Rejects with a readable message, e.g. an invalid username. */
  login(username: string): Promise<void>;
  onPower(action: 'restart' | 'shutdown'): void;
}
