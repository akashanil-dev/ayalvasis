# TuxOS

A pretend Linux computer that runs in the browser and teaches newcomers Linux and its ecosystem. An AI tutor,
Vasi the penguin, guides each learner and can operate the system himself. Every activity (Learn Linux, Learn
Docker, games) is a module that shows up as a desktop icon.

**Live:** https://tuxos.akashanil.dev

**Team:** Akash A · Edson Edwin Ninan

## Features

- **A desktop in the browser.** GRUB, a boot log, a login screen and four desktop environments you can switch
  between at any time: KDE Plasma, GNOME, CDE and Hyprland. Each has its own panels, window decorations, login
  screen and icon theme. Open windows are saved, so your desktop comes back as you left it.
- **Terminal.** A bash-like shell in each window, with pipes, redirection, variables, globs, `&&`/`||`, Tab
  completion, history and line editing. Ctrl+Alt+T opens one from anywhere.
- **Installing software with apt.** `apt`, `apt-get` and `dpkg` behave like Ubuntu's: changing packages needs
  `sudo`, `apt update` fetches the package lists first, dependencies come along (and `apt autoremove` cleans
  them up), and installed programs land in `/usr/bin` with dpkg's database in `/var/lib/dpkg`. Packages to try:
  `tree`, `hello`, `cowsay`, `sl`, `neofetch`, `fortune-mod` and `jq`. A missing program says how to get it
  (`sudo apt install tree`), as on Ubuntu.
- **Files and Text Editor.** A point-and-click file manager and an editor over the same filesystem. Both show
  real permission errors.
- **Plugins.** Discover and install Quick Notes, Focus Timer and Permission Explorer, or import your own
  self-contained plugin package through a graphical manager. Review permissions before installation, enable
  or disable plugins, export packages and remove them. Apps appear immediately in the desktop and launcher.
  Each plugin runs in a restricted iframe with access only to its approved private storage.
  See the [Plugin User Manual](docs/plugins.md) for step-by-step creation and installation, updates,
  permissions, troubleshooting and the package/SDK reference.
- **Learn Linux.** Before the first lab, the learner rates their Linux experience in five star questions. An AI
  trainer then designs a seven-day lab of real-world tasks at that level. Each task is explained first, then
  practised in the terminal, with one command per task. The trainer only nudges: hints and corrections get
  closer step by step, and the full answer is shown only after five wrong attempts, for the learner to type
  themselves. **Retake survey** designs a new lab. Without an AI key, Learn Linux teaches its seven built-in
  lessons instead, each command checked by the lesson's own rules.
- **Learn Docker.** A simulated `docker` CLI (`run`, `ps`, `images`, `logs`, `exec`, published ports with
  `curl`...) with an AI-designed lab, or five built-in lessons when no AI is available.
- **chmod Arcade.** A 60-second game for reading and writing file permissions.
- **Vasi, the AI tutor.** A penguin who walks along the bottom of the screen and answers questions. He can see
  the screen and your recent commands. He can also use the computer: he moves his own pointer, clicks, types
  into his own terminal and opens apps. He runs as a normal user and has to ask for sudo, with your password,
  before he can act as root. Every action shows in the chat, and **Stop** (or Esc) takes control back.
- **Accounts.** Sign up to save your system and continue on any device, or try it without an account and keep
  everything in the browser.
- **Bring your own AI key.** Vasi and the AI trainers use the learner's own OpenAI API key, added in
  **Settings → AI**. A signed-in learner's key is saved encrypted with their account; a guest's stays in their
  browser. Without a key, Vasi explains how to add one and everything else works as normal.

## Architecture

TuxOS is a TypeScript monorepo (npm workspaces). The "Linux" is a simulation written for teaching, not a real
Linux kernel. It models the parts a learner touches: users, file ownership, permission bits, root and sudo.

```
apps/web      React desktop (Vite, xterm.js)
apps/api      Node API: AI tutor and trainers, accounts, saves
packages/     kernel, sdk, shell, lessons, module-host, system, tutor, course-view, appearance
modules/      terminal, files, editor, settings, apt, learn-linux, learn-docker, chmod-arcade, about
```

- **Kernel** (`packages/kernel`): holds the system state. The only way to change it is
  `kernel.dispatch(action)`, which checks the caller's capabilities, runs the action as a Linux user so file
  permissions apply, and records the result in an event log. The learner, the shell, every module and the AI
  tutor all go through it, and a failed action leaves the state unchanged. Acting as another user (sudo) needs
  the `user:switch` capability.
- **Virtual filesystem**: files and directories with owners and Unix permission bits, a root-only
  `/etc/shadow`, `/dev/null` and errno-style errors (`ENOENT`, `EACCES`, `EPERM`).
- **Shell** (`packages/shell`): parses commands and implements its built-ins through `dispatch`. Every command
  line is logged as a `shell.ran` event, which lessons check.
- **SDK and module host** (`packages/sdk`, `packages/module-host`): a module declares its apps, commands and
  capabilities in a manifest, and its code loads only when first used. Every module action also becomes a tool
  for Vasi, so new modules extend the tutor without tutor changes.
- **Package manager** (`modules/apt`): a catalogue of packages (`catalog.ts`) with real versions, sizes and
  dependencies; dpkg's database lives in the simulated filesystem (`dpkg.ts`), so installs are saved with the
  learner's system; each package's program is written in TypeScript (`programs.ts`), since there are no real
  binaries. Package commands are registered from the start but say "not found" until installed, and a command's
  optional `available()` keeps them out of `help` and Tab completion.
- **Lessons** (`packages/lessons`): fixed courses are JSON, with each step checked by a small condition over
  what happened and the system state. AI courses run a survey, ask the API for a syllabus and send each command
  to it for assessment. Progress is saved in the learner's home folder (`~/.local/share/tuxos/`).
- **System client** (`packages/system`): the one API the UI uses for boot, saving, sessions, terminals and
  modules.
- **Plugin manager** (`packages/system/src/plugins.ts`, `apps/web/src/plugins`): one lifecycle for GUI and CLI
  operations, strict package validation, reviewed permissions, private storage quotas, versioned updates and
  immediate app-list updates. The bundled catalog works offline; custom packages are imported locally.
  `PluginWindowFrame` and `PluginRPCGateway` provide the restricted iframe and permission-checked bridge.
- **AI tutor** (`packages/tutor`, `apps/web/src/tutor`, `apps/api`): the browser keeps the conversation and
  runs the agent's tools (look at the screen, click, type, files, windows, module actions). The API adds Vasi's
  instructions and makes one model call per request with the learner's key, so it is stateless. Everything
  Vasi does is recorded as the `tutor` actor, so lessons count only the learner's own work.
- **API** (`apps/api`): a dependency-free Node server. `/api/tutor` serves the tutor, `/api/learning/*`
  (`plan`, `evaluate`, `hint`, `answer`) the trainers, and `/api/auth/*` and `/api/save` accounts. Model
  responses are validated before use. Passwords are stored as salted scrypt hashes and session tokens are
  hashed, both in SQLite (`node:sqlite`). Saves are versioned so an older tab can't overwrite newer progress,
  and requests are rate limited.
- **API keys** (`apps/api/src/ai-keys.ts`, `apps/web/src/ai-key.ts`): `/api/ai/key` checks a key with OpenAI
  (listing models, which costs nothing) and saves it sealed with AES-256-GCM. The encryption secret is kept
  outside the database (`TUXOS_KEY_SECRET`, or a `key-secret` file the server creates beside it). A guest's key
  goes with each AI request in an `x-openai-key` header and is never stored on the server. Each AI call uses
  the guest's key, else the account's saved key, else the server's `OPENAI_API_KEY` if one is set.

## Run locally

Requires Node.js 22.18 or newer. CI and production use Node 24.

```sh
npm install
cp .env.example .env    # optional settings
npm run dev             # API on :8787, desktop at http://localhost:5173
```

To try the AI features, add your OpenAI API key in **Settings → AI** inside TuxOS. Everything else works
without one. If the trainer doesn't load, check `http://localhost:8787/api/health`.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Optional. Provides AI for every learner at the server's expense; learners' own keys are used first. |
| `TUXOS_KEY_SECRET` | Optional. 64 hex characters (`openssl rand -hex 32`) to encrypt saved keys; otherwise `key-secret` is created beside the database. |
| `OPENAI_MODEL` | Default model (`gpt-4.1-mini`). |
| `OPENAI_MODEL_LINUX` | Learn Linux trainer (default `gpt-5.6-luna`). |
| `OPENAI_MODEL_DOCKER`, `OPENAI_MODEL_TERMINAL`, `OPENAI_MODEL_CHMOD_ARCADE` | Other trainers (default `OPENAI_MODEL`). |
| `OPENAI_BASE_URL` | Point at any OpenAI-compatible server, for example local inference. |

Never commit an API key. If one is exposed, revoke it and create a new one.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API and the desktop dev server |
| `npm run check` | Type check, then run the Vitest suite |
| `npm test` | Run the tests only |
| `npm run build` | Type check and build the desktop |
| `npm run api` | Start the API server only |

## Deployment

Production runs on an Ubuntu 24.04 server behind Cloudflare and Caddy. The files are in [`deploy/`](deploy) and
[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

- **CI:** every push and pull request runs `npm ci`, the type check, the tests and the web build.
- **CD:** a passing push to `main` uploads the release over SSH. `deploy/deploy.sh` installs it in
  `/opt/tuxos/releases/<commit>`, switches the `/opt/tuxos/current` symlink, restarts the `tuxos-api` systemd
  service and checks `/api/health`. If the check fails, it switches back to the previous release. The last five
  releases are kept.
- **Server:** Caddy serves `/opt/tuxos/current/web` and forwards `/api/*` to the API's Unix socket
  `/run/tuxos/api.sock` ([`deploy/Caddyfile`](deploy/Caddyfile)). The API runs as the unprivileged `tuxos` user
  ([`deploy/tuxos-api.service`](deploy/tuxos-api.service)), with secrets in `/etc/tuxos/tuxos.env` and the
  database at `/var/lib/tuxos/tuxos.db`. `TRUST_PROXY=1` makes rate limits use the visitor's IP.
- **One-time setup:** copy `deploy/` to the server and run `sudo bash deploy/setup-server.sh`. Leave
  `OPENAI_API_KEY` empty in `/etc/tuxos/tuxos.env` so learners use their own keys, add the Caddy site block and mounts, then add the GitHub secrets
  `DEPLOY_HOST`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` to a `production` environment.
- **Backup:** `sudo sqlite3 /var/lib/tuxos/tuxos.db ".backup /root/tuxos-backup.db"`, and keep
  `/var/lib/tuxos/key-secret` with it, separately: without it, saved API keys can't be read and learners must
  enter them again.
- **Manual rollback:** `ln -sfn /opt/tuxos/releases/<commit> /opt/tuxos/current`, then
  `sudo systemctl restart tuxos-api`. Logs: `journalctl -u tuxos-api`.

## Known limitations

- It is a simulation: there are no real processes, background jobs or long-running interactive programs, and
  the shell implements a teaching subset of bash.
- Group permissions are not modelled, and `ls -l` shows times in UTC.
- apt only knows the packages in its catalogue, each written for TuxOS; there are no real `.deb` packages or
  downloads. It can't answer its own "Do you want to continue?" question, so installs that pull in extra
  packages, and all removals, need `-y`. `docker.io` and the base system are listed as installed but can't be
  removed.
- The Docker simulation covers the commands and images listed above. Interactive container shells
  (`-it ... sh`) are not available.
- Vasi's agent flow was tested with a scripted model and in a real browser. The quality of his answers against
  the real model has not been reviewed systematically, and he has no memory between conversations.
- Accounts have no password reset.
- The key flow was tested against a stand-in for OpenAI, not with a real key. A learner's key is checked when
  it is saved; if it later runs out of credits, the AI calls report that.
- Each state-changing action copies the whole state, which is fine at learner-sized filesystems.

## Credits

Built with [TypeScript](https://www.typescriptlang.org/), [React](https://react.dev/), [Vite](https://vite.dev/),
[xterm.js](https://xtermjs.org/) and [Vitest](https://vitest.dev/). Tests use Testing Library and jsdom. Fonts:
[Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (SIL Open Font
License). Icon themes: GNOME (CC-BY-SA / GPL-3.0), Breeze (LGPL-3.0) and Papirus (GPL-3.0), used unmodified;
see [`apps/web/public/icons/CREDITS.md`](apps/web/public/icons/CREDITS.md). The AI features use the
[OpenAI API](https://platform.openai.com/docs/api-reference/chat).

The development history is in [CHANGELOG.md](CHANGELOG.md).
