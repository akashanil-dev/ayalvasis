import { DEFAULT_DESKTOP } from '@tuxos/kernel';
import { desktopById, wallpaperById } from '@tuxos/appearance';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useCallback, useEffect, useState } from 'react';
import { BootLog } from './boot/BootLog';
import { Grub } from './boot/Grub';
import { PowerOff } from './boot/PowerScreens';
import type { PowerAction } from './desktops/types';
import { Dtlogin } from './greeters/Dtlogin';
import { Gdm } from './greeters/Gdm';
import { Sddm } from './greeters/Sddm';
import { Tuigreet } from './greeters/Tuigreet';
import { lastAppearance } from './screens/appearance-memory';
import { Desktop } from './screens/Desktop';

export { Desktop } from './screens/Desktop';

type Screen = 'grub' | 'boot' | 'greeter' | 'desktop' | 'off';

/** Each desktop environment's display manager, as a real distribution pairs them. */
const GREETERS = { sddm: Sddm, gdm: Gdm, dtlogin: Dtlogin, tuigreet: Tuigreet };

/**
 * The whole machine, like a real PC: GRUB, the boot log, the login screen of the chosen desktop
 * environment, then the desktop. Power actions loop back to the right step.
 */
export function App({ system, tutor, start = 'grub' }: {
  system: SystemClient;
  tutor?: Transport;
  /** Tests can skip straight to the login screen. */
  start?: Screen;
}) {
  const [screen, setScreen] = useState<Screen>(start);
  const [recovery, setRecovery] = useState(false);
  // undefined while we still look for a saved account: the login screen waits so it shows the right user.
  const [savedUser, setSavedUser] = useState<string | null | undefined>(undefined);
  const [booted, setBooted] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(() => lastAppearance().desktop ?? DEFAULT_DESKTOP);

  useEffect(() => {
    if (screen !== 'greeter') return;
    setSavedUser(undefined);
    void system.hasSave().then(setSavedUser).catch(() => setSavedUser(null));
  }, [system, screen]);

  const login = useCallback(async (username: string) => {
    // Unlocking the running session keeps everything as it was; anyone else gets a fresh boot.
    if (booted !== username) await system.boot(username);
    setBooted(username);
    const session = await system.session();
    if (session.desktop !== desktop) await system.dispatch('session.setDesktop', { desktop });
    setScreen('desktop');
  }, [system, booted, desktop]);

  const power = useCallback((action: PowerAction) => {
    if (action === 'lock' || action === 'logout') {
      setScreen('greeter');
      return;
    }
    // Write the save now rather than after the usual short delay, so nothing is lost.
    void system.flush().catch(() => undefined).finally(() => {
      setBooted(null);
      setScreen(action === 'restart' ? 'grub' : 'off');
    });
  }, [system]);

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
    case 'desktop': return <Desktop system={system} tutor={tutor} onPower={power} />;
  }
  const greeter = desktopById(desktop).greeter;
  const Greeter = GREETERS[greeter];
  const wallpaper = wallpaperById(lastAppearance().wallpaper ?? '').background;
  return <div
    className={`greeter-screen greeter-${greeter}`}
    style={{ '--greeter-wallpaper': wallpaper } as React.CSSProperties}
  >
    {savedUser !== undefined && <Greeter
      system={system}
      savedUser={savedUser}
      desktop={desktop}
      onDesktop={setDesktop}
      login={login}
      onPower={(action) => power(action)}
    />}
  </div>;
}
