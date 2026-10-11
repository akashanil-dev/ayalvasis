import { DEFAULT_DESKTOP } from '@tuxos/kernel';
import { desktopById, wallpaperById } from '@tuxos/appearance';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useCallback, useEffect, useState } from 'react';
import { BootLog } from './boot/BootLog';
import { Grub } from './boot/Grub';
import { PowerOff } from './boot/PowerScreens';
import type { AccountsClient } from './accounts';
import type { PowerAction } from './desktops/types';
import { Dtlogin } from './greeters/Dtlogin';
import { Gdm } from './greeters/Gdm';
import { Sddm } from './greeters/Sddm';
import { Tuigreet } from './greeters/Tuigreet';
import type { LoginRequest } from './greeters/types';
import { preloadIconTheme } from './desktop/AppIcon';
import { lastAppearance } from './screens/appearance-memory';
import { Desktop } from './screens/Desktop';

export { Desktop } from './screens/Desktop';

type Screen = 'grub' | 'boot' | 'greeter' | 'desktop' | 'off';

/** Accounts, when the API offers them: the client, and where the system's saves should go. */
export interface AccountsWiring {
  client: AccountsClient;
  /** Point the system's storage at this browser (guests) or at the signed-in account. */
  use(target: 'local' | 'account'): void;
  /** This browser's guest save, read directly, to move it into a new account. */
  localSave(): Promise<string | null>;
}

const SAVE_KEY = 'tuxos.save';

/** Each desktop environment's display manager, as a real distribution pairs them. */
const GREETERS = { sddm: Sddm, gdm: Gdm, dtlogin: Dtlogin, tuigreet: Tuigreet };

/**
 * The whole machine, like a real PC: GRUB, the boot log, the login screen of the chosen desktop
 * environment, then the desktop. Power actions loop back to the right step.
 */
export function App({ system, tutor, accounts, start = 'grub' }: {
  system: SystemClient;
  tutor?: Transport;
  /** Without it (tests, offline builds) the login screen offers guests only. */
  accounts?: AccountsWiring;
  /** Tests can skip straight to the login screen. */
  start?: Screen;
}) {
  const [screen, setScreen] = useState<Screen>(start);
  const [recovery, setRecovery] = useState(false);
  // undefined while we still look for a saved guest and a signed-in account: the login screen waits for both.
  const [savedUser, setSavedUser] = useState<string | null | undefined>(undefined);
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  /** Who is running right now, as "guest:ada" or "account:ada", so unlocking keeps the same session. */
  const [booted, setBooted] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(() => lastAppearance().desktop ?? DEFAULT_DESKTOP);

  // Warm the cache for the desktop that will start, so its icons and wallpaper are ready at login.
  useEffect(() => {
    preloadIconTheme(desktop);
    if (typeof Image !== 'undefined') new Image().src = wallpaperById(lastAppearance().wallpaper ?? '').url;
  }, [desktop]);

  useEffect(() => {
    if (screen !== 'greeter') return;
    setSavedUser(undefined);
    setAccount(undefined);
    // Read the guest save directly: a locked account session keeps running, and its storage must not change.
    const guestSave = accounts
      ? accounts.localSave().then((saved) => (saved ? (JSON.parse(saved) as { username?: string }).username ?? null : null))
      : system.hasSave();
    void guestSave.then(setSavedUser).catch(() => setSavedUser(null));
    if (accounts) void accounts.client.me().then(setAccount);
    else setAccount(null);
  }, [system, screen, accounts]);

  const login = useCallback(async ({ mode, username, password }: LoginRequest) => {
    if (mode !== 'guest' && !accounts) throw new Error('Accounts are not available here.');
    if (mode === 'signin') await accounts!.client.login(username, password);
    if (mode === 'register') {
      // A guest who signs up with the same name brings their progress into the new account.
      const local = await accounts!.localSave();
      await accounts!.client.register(username, password);
      if (local && (JSON.parse(local) as { username?: string }).username === username) {
        const storage = accounts!.client.storage();
        await storage.get(SAVE_KEY);
        await storage.set(SAVE_KEY, local);
      }
    }
    if (mode !== 'guest') setAccount(username);
    accounts?.use(mode === 'guest' ? 'local' : 'account');
    const who = `${mode === 'guest' ? 'guest' : 'account'}:${username}`;
    // Unlocking the running session keeps everything as it was; anyone else gets a fresh boot.
    if (booted !== who) await system.boot(username);
    setBooted(who);
    const session = await system.session();
    if (session.desktop !== desktop) await system.dispatch('session.setDesktop', { desktop });
    setScreen('desktop');
  }, [system, accounts, booted, desktop]);

  const verifySudo = accounts && booted?.startsWith('account:')
    ? (password: string) => accounts.client.verify(password)
    : null;

  const power = useCallback((action: PowerAction) => {
    if (action === 'lock') {
      setScreen('greeter');
      return;
    }
    if (action === 'logout') {
      // Save first, then end an account's session so the next person at this computer can't continue it.
      void system.flush().catch(() => undefined).finally(async () => {
        if (booted?.startsWith('account:')) await accounts?.client.logout().catch(() => undefined);
        setBooted(null);
        setAccount(undefined);
        setSavedUser(undefined);
        setScreen('greeter');
      });
      return;
    }
    // Write the save now rather than after the usual short delay, so nothing is lost.
    void system.flush().catch(() => undefined).finally(() => {
      setBooted(null);
      setScreen(action === 'restart' ? 'grub' : 'off');
    });
  }, [system, booted, accounts]);

  const onBoot = useCallback((mode: 'normal' | 'recovery') => {
    setRecovery(mode === 'recovery');
    setScreen('boot');
  }, []);
  const toGreeter = useCallback(() => setScreen('greeter'), []);
  const powerOn = useCallback(() => setScreen('grub'), []);

  switch (screen) {
    case 'grub': return <Grub onBoot={onBoot} />;
    case 'boot': return <BootLog recovery={recovery} onDone={toGreeter} />;
    case 'off': return <PowerOff onPowerOn={powerOn} />;
    case 'desktop': return <Desktop system={system} tutor={tutor} onPower={power} verifySudo={verifySudo} />;
  }
  const greeter = desktopById(desktop).greeter;
  const Greeter = GREETERS[greeter];
  const wallpaper = wallpaperById(lastAppearance().wallpaper ?? '').background;
  return <div
    className={`greeter-screen greeter-${greeter}`}
    style={{ '--greeter-wallpaper': wallpaper } as React.CSSProperties}
  >
    {savedUser !== undefined && account !== undefined && <Greeter
      // A different account or guest means a fresh form, in the right mode for them.
      key={`${account}|${savedUser}`}
      system={system}
      savedUser={savedUser}
      account={account}
      accountsEnabled={Boolean(accounts)}
      desktop={desktop}
      onDesktop={setDesktop}
      login={login}
      onPower={(action) => power(action)}
    />}
  </div>;
}
