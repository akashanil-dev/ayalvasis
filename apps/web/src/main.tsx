import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { manifest as aboutManifest } from '@ayalvasis/module-about/manifest';
import { manifest as editorManifest } from '@ayalvasis/module-editor/manifest';
import { manifest as filesManifest } from '@ayalvasis/module-files/manifest';
import { manifest as learnLinuxManifest } from '@ayalvasis/module-learn-linux/manifest';
import { manifest as terminalManifest } from '@ayalvasis/module-terminal/manifest';
import { createLocalSystem, type KeyValueStorage } from '@ayalvasis/system';
import { httpTransport } from '@ayalvasis/tutor';
import { App } from './app';
import './styles/boot.css';
import './styles/login.css';
import './styles/desktop.css';
import './styles/window.css';
import './styles/tutor.css';

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

// Only manifests load up front; each module's code is fetched the first time it is used.
const system = createLocalSystem({
  storage,
  modules: [
    { manifest: terminalManifest, load: () => import('@ayalvasis/module-terminal').then((module) => module.terminal) },
    { manifest: filesManifest, load: () => import('@ayalvasis/module-files').then((module) => module.files) },
    { manifest: editorManifest, load: () => import('@ayalvasis/module-editor').then((module) => module.editor) },
    {
      manifest: learnLinuxManifest,
      load: () => import('@ayalvasis/module-learn-linux').then((module) => module.learnLinux),
    },
    { manifest: aboutManifest, load: () => import('@ayalvasis/module-about').then((module) => module.about) },
  ],
});
const tutor = httpTransport('/api/tutor');
createRoot(document.getElementById('root')!).render(<StrictMode><App system={system} tutor={tutor} /></StrictMode>);
