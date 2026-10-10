import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { manifest } from '@ayalvasis/module-about/manifest';
import { createLocalSystem, type KeyValueStorage } from '@ayalvasis/system';
import { App } from './app';
import './styles/boot.css';
import './styles/login.css';
import './styles/desktop.css';
import './styles/window.css';

const storage: KeyValueStorage = {
  async get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      throw new Error(`save failed: ${String(error)}`);
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      throw new Error(`reset failed: ${String(error)}`);
    }
  },
};

const system = createLocalSystem({
  storage,
  modules: [{
    manifest,
    load: () => import('@ayalvasis/module-about').then((module) => module.about),
  }],
});
createRoot(document.getElementById('root')!).render(<StrictMode><App system={system} /></StrictMode>);
