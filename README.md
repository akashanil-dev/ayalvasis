# DevDay Exchange Community Hackathon: Kochi

A repository template for participants at the 10–11 October 2026 hackathon. It contains event rules and documentation scaffolding; build your project from scratch at the event.

**[Event and registration on Luma](https://luma.com/z10nz8gp)** · **[Event rules](RULES.md)** · **[Agent instructions](AGENTS.md)**

## Event details

| Detail | Information |
| --- | --- |
| Venue | JAIN University, Kochi |
| Location | [Open the venue map](https://maps.app.goo.gl/Eme7gR7NDXSNRANu5) |
| Rooms | 2008 and 2009 |
| Check-in | 10 October 2026, 6:00 PM IST |
| Kick-off | 10 October 2026, 6:30 PM IST |
| Wrap-up | 11 October 2026, by 10:00 AM IST |
| Participation | Solo or a team of up to 4 participants |
| Theme | Open — build anything you like |

Keep your approved Luma QR code ready for entry, and bring your laptop and charger. Eligible checked-in participants will receive Codex credits and OpenAI API credits.

## Use this template

1. Select **Use this template → Create a new repository** on GitHub. Create your own project repository and clone it.
2. Read [RULES.md](RULES.md) and [AGENTS.md](AGENTS.md) before building. Begin project implementation at the event.
3. Fill in the project overview below as you build. Use any suitable language or framework, keeping the implementation simple.
4. Record meaningful changes in [CHANGELOG.md](CHANGELOG.md) and your Codex usage in [AI_USAGE.md](AI_USAGE.md). Commit after completed milestones; aim for a meaningful checkpoint about every 30 minutes.
5. Complete [SUBMISSION.md](SUBMISSION.md) with your code repository, short project description, and working demo. Follow submission instructions announced by the organizers.

This template has no application code or required technology stack. The documentation and commit cadence are repository workflow guidance; the event participation rules are in [RULES.md](RULES.md).

## Project overview — complete during the event

- **Project name:** TuxOS
- **Short description:** A pretend Linux computer that runs in the browser and teaches newcomers Linux and its ecosystem. An AI tutor guides each learner and can operate the system itself. Every activity (Learn Linux, Learn Docker, games) is a module that shows up as a desktop icon.
- **Team:** TODO — participant names and GitHub handles; maximum 4 members.
- **Working demo:** TODO — link or local demo instructions.
- **Technology stack:** TypeScript, npm workspaces, React, Vite, xterm.js, Vitest, Node.js (API server),
  OpenAI Chat Completions with tool calling (AI tutor).

### Architecture

- **Kernel** (`packages/kernel`): owns the system state. The only way to change it is `kernel.dispatch(action)`, which:
  - checks the sender's capabilities
  - runs the action as a Linux user, so file permissions apply
  - records the result in an event log that others can subscribe to

  The learner, modules and the AI tutor all use this same entry point.
- **SDK** (`packages/sdk`): shared types (actions, events, actors, capabilities, module manifests,
  and the module activation API) that the kernel, modules, UI and tutor build on. Its action and
  command definitions are generic structural contracts, so it has no runtime dependency on either.
- **Shell** (`packages/shell`): a bash-like teaching shell. It parses commands, expands variables and globs, runs pipelines and redirections, and implements built-ins entirely through `kernel.dispatch`.
- **Lessons** (`packages/lessons`): a lesson engine. Courses are JSON data; each step's check is a small
  condition over what happened (`ran`, `opened`, `cwd`) and the system's state (`exists`, `missing`,
  `contains`, `mode`), combinable with `all`/`any`/`not`. Shell commands are logged as `shell.ran` events,
  which is what `ran` checks see. Every lesson carries a solution that tests replay ("lesson CI").
- **AI tutor** (`packages/tutor` + `apps/api`): Vasi, a penguin teacher with full control of the computer.
  - Persona (in `apps/api/src/prompt.ts`): kind and patient, and a teacher, not a helper who does your work.
    He shows, then hands the keyboard back; he may set up exercises or rescue a broken system, and says what he
    did. Lessons only count the learner's own actions, because the kernel records everything Vasi does as the
    `tutor` actor.
  - The browser keeps the conversation. `apps/api`, a dependency-free Node server, holds the OpenAI key,
    adds the tutor's instructions and makes one model call per request, so it is stateless and scales out.
  - Agent tools: `look_at_screen` reads the screen like a screen reader (buttons, fields and icons with ids);
    `click`, `type_text` and `press_keys` act on it with Vasi's own drawn pointer (a web page can't move the
    real mouse); `type_in_terminal` types commands live into "Vasi's terminal"; plus files, windows,
    desktop/wallpaper and every module action (e.g. `learn-linux__start`). The browser side is
    `apps/web/src/tutor/screen-agent.ts`.
  - Root: Vasi starts as an ordinary user. `request_sudo` shows an authentication dialog with his reason; if the
    learner allows it and types a password, he is granted `user:switch` until logout or until the learner
    clicks Revoke. If they deny it, he is told so and takes it with good humour. TuxOS accounts have no real
    password, so any password is accepted (the dialog says so).
  - While Vasi works, a bar shows what he is doing with a **Stop** button (or Esc) that hands control back.
  - Every module action becomes a tool automatically (e.g. `learn-linux__start`), so new modules extend
    what the tutor can do without tutor changes.
- **Module host** (`packages/module-host`): validates manifests, registers lazy command stubs,
  activates dependency chains, grants declared capabilities, and reports activation state/events.
  It depends on the kernel and shell; adding a module only requires registering its manifest and
  loader with the host.
- **System client** (`packages/system`): the single UI-facing API for boot, persistence, events,
  sessions, terminals and module activation. Session reads are direct cloned state reads, while `onChange`
  reports successful mutations. It runs on the main thread for now; a Web Worker is planned.
- **Web app** (`apps/web`): a Vite + React desktop with boot and login screens, kernel-backed windows and
  lazy app views. Four desktop environments, each with its own shell, window decorations, login screen and
  icon theme, all available at any time from the login screen or Settings:
  - **KDE Plasma** (SDDM): bottom panel, task manager, Kickoff, KRunner (Alt+Space), desktop icons.
  - **GNOME** (GDM): top bar, Activities overview with dash and app grid, hot corner.
  - **CDE** (dtlogin): Front Panel, four workspaces, Motif windows, minimised windows as desktop icons.
  - **Hyprland** (tuigreet): Waybar, wofi, tiling windows and five workspaces, driven by Alt shortcuts
    (Alt+Q terminal, Alt+R launcher, Alt+C close, Alt+1…5 switch, Alt+Shift+1…5 move).
  Wallpapers and icon themes are static files in `apps/web/public` (icon credits in `public/icons/CREDITS.md`).
- **Modules** (`modules/*`): each one adds desktop apps and shell commands through a manifest, and its code
  loads only when first used. Current modules:
  - **Terminal**: xterm.js on a per-window shell, with a tested line editor and the `clear` command.
  - **Files**: a point-and-click file manager over the same filesystem.
  - **Text Editor**: opens, edits and saves files, explaining permission errors.
  - **Learn Linux**: six hands-on lessons that check your work as you go, with progress saved in
    `~/.local/share/tuxos/learn-linux.json` like a real Linux app.
  - **Learn Docker**: a simulated `docker` CLI and `curl`, plus a five-lesson Docker course.
  - **chmod Arcade**: a 60-second game for reading and writing file permissions.
  - **About**: system information and the `uname` command.
  Course modules share `activateCourse` (from `packages/lessons`) and the course window (`packages/course-view`),
  so a new course is mostly a JSON file.

### Run the project

1. Prerequisites and versions: Node.js 20 or newer (developed on Node 26.7, npm 11.19).
2. Dependency installation: `npm install`
3. Environment setup: for the AI tutor, copy `.env.example` to `.env` and set `OPENAI_API_KEY` (optionally
   `OPENAI_MODEL`, default `gpt-4.1-mini`). Linux uses `gpt-5.6-luna` by default for lower-cost assessment; override it with `OPENAI_MODEL_LINUX`. Set `OPENAI_MODEL_DOCKER`, `OPENAI_MODEL_TERMINAL`, and
   `OPENAI_MODEL_CHMOD_ARCADE` to route the other learning modules independently; those modules fall back to `OPENAI_MODEL`. Everything else works without an API key; the tutor then explains that it
   isn't set up.
4. Configure the tutor locally. First create a new OpenAI API key if an old one has ever been exposed. Copy
   `.env.example` to `.env` and set `OPENAI_API_KEY` there. The file is ignored by Git. The key is read only by
   the Node API server; it is never bundled into the browser, exposed as a `VITE_*` variable, or sent to the
   frontend. In production, inject it with the hosting provider's secret manager rather than storing `.env`.
5. Start the project: `npm run dev` starts both the local tutor API and the desktop dev server, then open the URL
   printed by Vite (normally `http://localhost:5173`). The API reads the server-only key from `.env`, listens on
   port 8787, and the dev server forwards `/api` to it. Check `http://localhost:8787/api/health` if the AI trainer
   does not load.
6. Run checks or tests: `npm run check` (TypeScript type check, then the Vitest suite). `npm test` runs only the tests.

Never paste an API key into source files, commit history, issue trackers, chat, or browser developer tools. If a
key is exposed, revoke it immediately and create a replacement; changing the model or `.env` value does not
invalidate the old credential.

### Current status

- Working features:
  - **Browser desktop:** boot/login flow, saved-system continuation, four switchable desktop environments
    (KDE Plasma, GNOME, CDE, Hyprland) with matching login screens, image wallpapers, per-desktop icon themes,
    workspaces (CDE, Hyprland), tiling (Hyprland) and accessible kernel-backed windows.
  - **System client:** local in-process boot/restore, debounced injected-storage persistence, event
    subscriptions, module activation, session API and terminal API. A Web Worker is planned.
  - **Terminal:** one bash-like shell per window with the prompt `user@host:dir$ `, the motd on start, Tab
    completion of commands and paths (a second Tab lists candidates), Up/Down history, line editing
    (arrows, Home/End, Ctrl+A/E/U), Ctrl+C, Ctrl+L, Ctrl+D, `exit` and `clear`. The window title follows
    the current directory. Ctrl+Alt+T opens a terminal from anywhere on the desktop.
  - **Files:** browse folders, Back/Up, typed locations, New Folder/New File with name checks, Delete with
    confirmation, Ctrl+H for hidden files, kernel errors shown inline, and live refresh when files change
    from anywhere (for example the terminal). Double-clicking a file opens it in the Text Editor.
  - **Text Editor:** opens a window's file, dirty marker in the title, Ctrl+S to save, Save As for new
    documents, a prompt before closing with unsaved changes, and a sudo tip on permission errors.
  - **Learn Linux:** six lessons (first commands, moving around, making files, reading and searching,
    pipes, permissions and sudo). Each step is checked automatically from what the learner does in the
    terminal or on the desktop, with hints on demand and an explanation after each step. Progress survives
    reloads and keeps tracking while the window is closed. Lesson start, quit, reset and status are kernel
    actions, so the AI tutor can drive lessons the same way. With the learning API configured, a Linux
    certification trainer generates industry scenarios and terminal `/hint`, `/answer`, `/task`, and `/next`
    controls work across the active course; the reviewed JSON course is the offline fallback.
  - **Learn Docker:** a simulated Docker with real-looking output and errors: `run` (with `-d`, `--name`,
    `-p`, `-e`, `--rm`), `ps [-a]`, `images`, `pull`, `stop`, `start`, `restart`, `rm [-f]`, `rmi`, `logs`,
    `exec`, and images hello-world, alpine, ubuntu, python, nginx, redis and postgres. Published ports work
    with `curl localhost:PORT`, which nginx answers and logs. State persists in a root-only
    `/var/lib/docker`. Five lessons: first container, images, serving a website, cleaning up, and
    configuring with environment variables.
  - **chmod Arcade:** alternating questions (rwx to octal, octal to rwx with toggle buttons), streak bonuses,
    an explanation of each wrong answer, and the best score saved in `~/.local/share/tuxos/`.
  - **AI tutor (Vasi):** a penguin puppet in the corner opens a chat. Vasi looks at the learner's recent
    commands and the screen before answering, and can use the computer himself: his own pointer glides to
    what he clicks, he types into fields and into his own visible terminal, presses shortcuts, arranges
    windows, switches desktops, writes files and starts lessons. He asks for sudo (with the learner's
    password) when he needs root. Each action shows in the chat as it happens, and Stop (or Esc) takes control
    back. After two failed commands in a row, a nudge offers
    help; nothing is sent to the AI until the learner asks. Errors (no key, quota, service down) are shown in
    plain words.
  - **AI-designed learning backend:** `/api/learning/plan` creates a seven-day terminal-first syllabus whose
    first task on each day after day one is explicitly marked and written as a recap; each Linux mission asks for one command line only (a pipeline is allowed when it is the lesson), and Enter advances only after that command is correct. Linux assessment feedback is capped at 110 characters and `/answer` returns a concise command plus reason (at most 140 characters). Fresh syllabus planning excludes cached attempt history; hints and answers receive only the last three short memory entries for the active task. Learning terminals stay bound to their own module trainer, and the Linux task header marks recap versus new work. Learning endpoints use module-specific trainer personas. The single-command Linux syllabus is saved separately so older local plans remain untouched.
    The server validates structured responses and never exposes the API key to the browser. Generated progress and a
    bounded, module-specific memory cache are saved in the user's virtual home under
    `~/.local/share/tuxos/ai-learning/`; the API remains stateless. To keep model execution local too, point
    `OPENAI_BASE_URL` at a local OpenAI-compatible inference server; otherwise only state and memory are local.
  - **Security:** acting as another user (sudo) needs the `user:switch` capability, so neither modules nor the
    tutor can escalate to root unless granted it.
  - **About module:** contributes the About app and `uname` command, including `uname -a` hostname output.
  - **More Linux realism:** `/dev/null`, a root-only `/etc/shadow`, `chmod +x` and comma-separated symbolic
    modes (`u=rw,go=`).
  - **Shared commands:** every terminal has its own cwd, environment and history but shares one command
    registry, so commands a module installs work in all of them.
  - **Saving** never blocks the learner: changes are written after a 500 ms pause, and storage failures are
    reported to listeners instead of failing the command.
  - **Kernel:** action registry, `dispatch` with capability checks, an event log with subscribers and a size limit, and JSON snapshots and restore. A failed action leaves the state unchanged.
    Actions receive permission-bound filesystem helpers through `ActionContext.fs`; raw VFS mutators
    are not part of the kernel package API.
  - **Virtual filesystem:**
    - stat, read, list, write/append, mkdir (with `-p` behaviour), remove (with recursive), chmod
    - deterministic modification times, Linux-style parent-directory updates, and backward-compatible snapshots
    - Unix owner/other permissions, including execute permission to enter a directory, with root overrides
  - **Tests:** covered by Vitest unit tests, including module-host contract and failure tests.
  - **Shell:** parser, command executor, pipelines, redirections, variables, globs, conditional operators, permissions-aware built-ins, and module command registration.
  - **GNU fidelity:** errno diagnostics preserve typed paths; `cp`/`mv` support directory targets;
    `ls` supports hidden entries, `-d`, and long listings; text commands accept `-` for stdin.
    Text commands also process multiple file operands with GNU-style headers and totals.
- Known limitations:
  - Group permissions aren't modelled.
  - `ls -l` shows times in UTC rather than the browser's time zone.
  - The terminal redraws an edited line with a carriage return, so a line longer than the terminal width
    redraws imperfectly. A command's error output is shown after its normal output, not interleaved.
  - The AI tutor has been tested with a scripted model and, in a real browser, through the API server
    against a local stand-in for the OpenAI API. It has not yet been run against a real OpenAI model in this
    environment (no API key here), so answer quality is unverified.
  - The Docker simulation covers the commands and images listed above. Commands inside containers are
    limited to a few (echo, cat /etc/os-release, env, ls, uname...), and interactive shells (`-it ... sh`)
    are not available yet.
  - The tutor has no long-term memory of the learner between conversations.
  - Commands run to completion before the prompt returns; there are no background jobs or long-running
    interactive programs yet.
  - Each state-changing action copies the whole state, which is fine at learner-sized filesystems; this can be revisited if it gets slow.
  - The shell intentionally implements only the command/options listed in its package task; it is not a complete Bash or POSIX shell.
  - Some GNU formatting and shell-language edge cases remain simplified for the teaching filesystem;
    long listings use the virtual filesystem's fixed UTC clock values.
  - The module host and SDK contract are implemented, with hello, notes, failure, and missing-command
    fixtures proving the contract. Failed module activation rolls back registered actions, commands
    and capability grants.
- Libraries, APIs, and public datasets used: [TypeScript](https://www.typescriptlang.org/),
  [Vitest](https://vitest.dev/), [React](https://react.dev/), [Vite](https://vite.dev/) and
  [xterm.js](https://xtermjs.org/) (MIT) with its fit addon. The Terminal uses the Tango colour palette.
  The AI tutor calls the [OpenAI API](https://platform.openai.com/docs/api-reference/chat) (Chat Completions
  with tool calling) from the API server. No public datasets are used.

See [AI_USAGE.md](AI_USAGE.md) for AI assistance and [CHANGELOG.md](CHANGELOG.md) for the development record.
