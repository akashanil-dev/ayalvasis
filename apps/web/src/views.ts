import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SystemClient } from '@ayalvasis/system';

export interface AppViewProps { system: SystemClient; windowId: string }
type ViewModule = { default: ComponentType<AppViewProps> };

export const views: Record<string, () => Promise<ViewModule>> = {
  about: () => import('@ayalvasis/module-about/view'),
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
