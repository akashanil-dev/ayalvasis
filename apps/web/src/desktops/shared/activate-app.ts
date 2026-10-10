import type { ShellProps } from '../types';

/**
 * What clicking an app in a panel does on most desktops: open it if it isn't running, bring its newest
 * window forward if it is, or minimise that window if it already has focus.
 */
export function activateApp(props: ShellProps, appId: string, canMinimize = true): void {
  const { session, open, activate, minimize } = props;
  const top = session.windows.filter((window) => window.appId === appId).sort((a, b) => b.z - a.z)[0];
  if (!top) return open(appId);
  const showing = !top.minimized && props.workspaceOf(top.id) === props.workspace;
  if (showing && session.focusedId === top.id && canMinimize) minimize(top.id);
  else activate(top.id);
}
