import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppViewProps } from '@tuxos/system';

export type { AppViewProps } from '@tuxos/system';
type ViewModule = { default: ComponentType<AppViewProps> };

// Each app's window content, loaded only when its first window opens.
export const views: Record<string, () => Promise<ViewModule>> = {
  about: () => import('@tuxos/module-about/view'),
  terminal: () => import('@tuxos/module-terminal/view'),
  files: () => import('@tuxos/module-files/view'),
  editor: () => import('@tuxos/module-editor/view'),
  'learn-linux': () => import('@tuxos/module-learn-linux/view'),
  'learn-docker': () => import('@tuxos/module-learn-docker/view'),
  'chmod-arcade': () => import('@tuxos/module-chmod-arcade/view'),
  settings: () => import('@tuxos/module-settings/view'),
};

const lazyViews = new Map<string, LazyExoticComponent<ComponentType<AppViewProps>>>();

export function getLazyView(appId: string): LazyExoticComponent<ComponentType<AppViewProps>> | null {
  const loader = views[appId];
  if (!loader) return null;
  let component = lazyViews.get(appId);
  if (!component) {
    component = lazy(loader);
    lazyViews.set(appId, component);
  }
  return component;
}
