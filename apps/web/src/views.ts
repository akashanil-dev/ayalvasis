import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppViewProps } from '@ayalvasis/system';

export type { AppViewProps } from '@ayalvasis/system';
type ViewModule = { default: ComponentType<AppViewProps> };

// Each app's window content, loaded only when its first window opens.
export const views: Record<string, () => Promise<ViewModule>> = {
  about: () => import('@ayalvasis/module-about/view'),
  terminal: () => import('@ayalvasis/module-terminal/view'),
  files: () => import('@ayalvasis/module-files/view'),
  editor: () => import('@ayalvasis/module-editor/view'),
  'learn-linux': () => import('@ayalvasis/module-learn-linux/view'),
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
