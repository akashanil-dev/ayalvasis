import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // xterm.js is only imported when the first Terminal opens. Pre-bundling it up front stops the dev server
  // from discovering it then and reloading the page, which would throw the learner back to the login screen.
  optimizeDeps: { include: ['@xterm/xterm', '@xterm/addon-fit'] },
});
