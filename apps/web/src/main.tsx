import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { manifest as aboutManifest } from '@tuxos/module-about/manifest';
import { manifest as arcadeManifest } from '@tuxos/module-chmod-arcade/manifest';
import { manifest as editorManifest } from '@tuxos/module-editor/manifest';
import { manifest as filesManifest } from '@tuxos/module-files/manifest';
import { manifest as learnDockerManifest } from '@tuxos/module-learn-docker/manifest';
import { manifest as learnLinuxManifest } from '@tuxos/module-learn-linux/manifest';
import { manifest as terminalManifest } from '@tuxos/module-terminal/manifest';
import { createLocalSystem, type KeyValueStorage } from '@tuxos/system';
import { httpTransport } from '@tuxos/tutor';
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
    { manifest: terminalManifest, load: () => import('@tuxos/module-terminal').then((module) => module.terminal) },
    { manifest: filesManifest, load: () => import('@tuxos/module-files').then((module) => module.files) },
    { manifest: editorManifest, load: () => import('@tuxos/module-editor').then((module) => module.editor) },
    {
      manifest: learnLinuxManifest,
      load: () => import('@tuxos/module-learn-linux').then((module) => module.learnLinux),
    },
    {
      manifest: learnDockerManifest,
      load: () => import('@tuxos/module-learn-docker').then((module) => module.learnDocker),
    },
    {
      manifest: arcadeManifest,
      load: () => import('@tuxos/module-chmod-arcade').then((module) => module.chmodArcade),
    },
    { manifest: aboutManifest, load: () => import('@tuxos/module-about').then((module) => module.about) },
  ],
});
const tutor = httpTransport('/api/tutor');
createRoot(document.getElementById('root')!).render(<StrictMode><App system={system} tutor={tutor} /></StrictMode>);
