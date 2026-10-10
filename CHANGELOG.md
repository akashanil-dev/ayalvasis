# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-11T05:00:28+05:30 — Vasi becomes a teaching agent with full control

- Changed:
  - Vasi has a teacher persona: kind, patient, shows then hands the keyboard back, never does lesson steps for
    the learner, may set up exercises and rescue a broken system (`apps/api/src/prompt.ts`).
  - The Guide / Demo / Drive autonomy switch is gone: Vasi always has every tool.
  - New agent tools (`packages/tutor/src/tools.ts`): `look_at_screen` now lists clickable and typeable elements
    with ids; `click`, `type_text`, `press_keys`, `type_in_terminal` (types live into a visible "Vasi's
    terminal" whose commands run as the tutor), `manage_window`, `change_appearance` and `request_sudo`.
  - The browser side (`apps/web/src/tutor/screen-agent.ts`) reads the screen like a screen reader and acts with
    Vasi's own drawn pointer (gliding arrow with a name tag and click ripple) and synthetic events.
  - Sudo: `request_sudo` shows an authentication dialog with Vasi's reason, then a password prompt; allowing it
    grants `user:switch` until logout or Revoke. Denial is reported to Vasi, who is told to take it with humour.
  - A "Vasi is using the computer · Stop (Esc)" bar; Stop ends the current answer without further actions.
  - Longer agent turns: up to 16 model rounds per question, the current question is always kept in the request
    even when trimming history, and the API accepts up to 160 messages and 60 tools.
  - Terminal app: a `tuxos:terminal-type` window event lets Vasi type into a terminal; windows opened with
    `owner: 'vasi'` run a tutor shell and are titled "Vasi's terminal".
  - Fixed: `sudo` read options meant for the command (`sudo head -n 2 f` failed); options now end at the command.
- Why: The team wants Vasi to act like a teacher at the learner's shoulder who can use the computer himself.
- Validation: `npm run typecheck` passed. `npx vitest run`: 24 test files, 270 tests passed (new tests for the
  agent tools, sudo granted/denied/revoked, Stop, long turns, the screen agent and sudo option parsing).
  `npm run build` passed. In headless Chromium with a scripted stand-in for the model API: Vasi looked at the
  screen, double-clicked Files, typed `ls -l /etc` in his terminal, asked for sudo (allowed with a password, then
  ran `sudo head -n 2 /etc/shadow`) and, in a second run, was denied and answered with a joke.
- Limitations: not yet tried against the real model, so how well it follows the persona and uses element ids is
  untested. Any password is accepted because TuxOS accounts have none. Clicks and typing outside Vasi's own
  terminal run as the learner, so the persona (not the kernel) keeps him from doing lesson work through the UI.
  `head` and `tail` still accept only `-n N`, not the `-N` shorthand.

## 2026-10-11T04:14:36+05:30 — Module-local learning memory and model routing

- What changed: Added bounded local memory files per learning module, memory-aware planning/hints/answers/evaluation, and independent environment-configurable model routing for Linux, Docker, Terminal, and chmod-arcade.
- Why: Keep learner continuity distinct between trainer personas and make module model choice explicit without putting secrets or learner history in the browser/API state.
- Affected files: `packages/lessons/src/ai.ts`, `apps/api/src/learning.ts`, `apps/api/src/server.ts`, `apps/api/src/tutor.ts`, `.env.example`, `README.md`, and learning tests.
- Validation: `npm run check` passed with 22 test files and 251 tests; `npm run build` passed; `git diff --check` passed.
- Known limitation: OpenAI-compatible generation is remote unless `OPENAI_BASE_URL` points to a local inference server; persisted state and memory are always local to the virtual filesystem.

## 2026-10-11T04:10:23+05:30 — AI-designed terminal learning backend

- Changed:
  - Added server-side `/api/learning/plan`, `/evaluate`, `/hint`, and `/answer` endpoints with structured response validation and per-module trainer personas.
  - Added AI course runners for Learn Linux and Learn Docker. They generate seven-day, industry-scenario syllabi, require recap tasks after day one, evaluate actual terminal evidence, and persist progress.
  - Added terminal-native `/hint`, `/answer`, `/task`, and `/next` commands without changing frontend components; AI-mode command results include an explicit trainer assessment.
  - Preserved the existing reviewed JSON courses as a deterministic fallback when the AI service is unavailable.
- Why: Make learning content adaptive and realistic while keeping execution local, auditable, and safe.
- Validation: `npm run check` passed with 22 test files and 250 tests; `npm run build` passed; `npm install --package-lock-only --ignore-scripts` completed.
- Limitations: AI content quality depends on the configured model; the fallback is intentionally deterministic; real API/browser validation requires a valid server-side key and running local servers.


## 2026-10-11T04:11:58+05:30 — UI redesign and four desktop environments (adds CDE and Hyprland)

- Changed:
  - New look across the whole UI: per-desktop design tokens (Breeze Dark, Adwaita dark, CDE Motif grey,
    Catppuccin Mocha) in `apps/web/src/styles/base.css`, Inter and JetBrains Mono fonts, image wallpapers
    with thumbnails (`apps/web/public/wallpapers`) and a per-desktop app icon theme (`apps/web/public/icons`,
    credits in `icons/CREDITS.md`). The default wallpaper is now `freedom`; older saves fall back to it.
  - Two new desktop environments, available from the start like the others: **CDE** (Front Panel with analog
    clock, calendar, launchers, Lock/EXIT and four workspaces; Motif window decorations with a window menu;
    minimised windows become desktop icons) and **Hyprland** (Waybar, wofi launcher, master/stack tiling with
    no title bars, five workspaces, Alt-key shortcuts). Workspaces are desktop state, not saved session state.
  - Two new login screens: dtlogin (CDE) and tuigreet (Hyprland). SDDM and GDM were redesigned (blurred
    wallpaper, Tux avatar, session menus). Every login screen can start any of the four desktops.
  - Settings is one page with a card per desktop (no locks) and a wallpaper grid; About details moved there.
  - Restyled GRUB, boot log, power-off, per-desktop splash screens, Plasma panel/Kickoff/KRunner, GNOME bar and
    overview, Files, Text Editor, Terminal palette, course view and Vasi's panel, which now takes each
    desktop's colours. Vasi's puppet is unchanged.
  - Closing a window goes through the desktop, so keyboard close (Hyprland Alt+C) still respects the Text
    Editor's unsaved-changes prompt.
- Why: The team wanted a complete visual redesign and all four desktop environments open to every learner.
- Files: `apps/web` (screens, desktops, greeters, boot, styles, public assets), `packages/appearance`,
  `packages/kernel` (default wallpaper, action description), `packages/course-view`, `modules/settings`,
  `modules/files`, `modules/editor`, `modules/terminal`, `modules/chmod-arcade`.
- Validation: `npm run typecheck` passed. `npx vitest run`: 22 test files, 252 tests passed (new tests for the
  tiling layout, CDE login and workspaces, Hyprland login/launcher/keyboard close, and switching between all
  four desktops from Settings). `npm run build` passed. Screenshotted every login screen, desktop, launcher and
  Settings in headless Chromium at 1366×800.
- Limitations: the Google Fonts stylesheet needs network access (system fonts are used offline). Learn Linux
  and About have no themed icon, so they use TuxOS's own icons in every desktop. Phone-width layouts were
  styled but not checked in a browser.

## 2026-10-11T03:08:17+05:30 — Boot sequence, login screens and desktop environments (KDE Plasma, GNOME)

- Changed:
  - A real-PC start-up: GRUB menu (countdown, advanced options, memory test), kernel and systemd boot log,
    shutdown log and a power-off screen.
  - Login screens per desktop: SDDM (Breeze) for KDE Plasma and GDM for GNOME, with a session chooser,
    restart and shut down; lock and log out return to them.
  - Desktop environments as pluggable shells: KDE Plasma (panel, task manager, Kickoff with categories,
    KRunner on Alt+Space, Peek at Desktop, Leave menu, desktop icons, Breeze decorations) and GNOME (top bar,
    Activities overview with window previews, dash, app grid, hot corner, system menu, Adwaita decorations).
    The Super key opens the launcher; right-click menus on the desktop; a one-time welcome per desktop.
  - The kernel session stores the desktop and wallpaper (`session.setDesktop`, `session.setWallpaper`), so the
    tutor can switch them too. New `packages/appearance` lists desktops and CSS-only wallpapers; new
    `modules/settings` switches them live. Apps declare a launcher category in their manifests.
  - Fixed: out-of-order session reads could hide a just-opened window; the login screen could show "choose a
    username" to a returning learner; Plasma shortcuts didn't work while the terminal had focus.
  - Design inspired by the team's earlier Tuxplore project; all code, styles and artwork here were written at
    the event (Tuxplore's files are not part of this repository).
- Why: The team wants TuxOS to look and feel like a real Linux computer from the moment it starts.
- Validation: `npm run check` — type check passed; Vitest reported 21 test files and 246 tests passed.
  `npm run build` passed. Walked through GRUB, boot log, SDDM, Plasma, Kickoff and the terminal in Chromium.
- Limitations: GNOME, the overview and Settings were covered by tests but the in-browser walkthrough stopped
  before them; only two desktop environments so far.

## 2026-10-11T02:54:39+05:30 — Renamed the project to TuxOS

- Changed: the product is now called TuxOS. Package scope `@ayalvasis/*` became `@tuxos/*`, the hostname and
  prompt became `tuxos`, browser storage keys and the tutor's instructions were updated. The GitHub repository
  keeps its name. Earlier changelog and AI usage entries still say ayalvasis, as they did when written.
- Why: The team chose TuxOS as the product name.
- Validation: `npm run check` — type check passed; Vitest reported 20 test files and 239 tests passed.
  `npm run build` passed.
- Limitations: saves made under the old storage key are not migrated, so earlier local test systems start fresh.

## 2026-10-11T02:17:58+05:30 — Learn Docker and chmod Arcade

- Changed:
  - New `modules/learn-docker`: a deterministic Docker engine (images, containers, published ports, logs,
    environment variables) behind a `docker` CLI with Docker's tables, messages and exit codes, a `curl` for
    localhost, state kept as root in `/var/lib/docker` (mode 710), and a five-lesson course.
  - New `modules/chmod-arcade`: a 60-second permissions game with streak scoring, explanations and a saved
    best score.
  - Course modules now share `activateCourse` (in `packages/lessons`) and `CourseView` (new
    `packages/course-view`); Learn Linux uses them unchanged.
  - Corrected the AI tutor changelog entry: it said 19 test files; there were 18.
- Why: Learning Docker was part of the plan, and a game gives learners a quick, fun way to practise
  permissions. Sharing the course code means a new course is mostly a JSON file.
- Validation: `npm run check` — type check passed; Vitest reported 20 test files and 239 tests passed,
  including exact Docker output tests and a replay of all five Docker lessons. `npm run build` passed. In
  Chromium: ran nginx with a published port, saw it in `docker ps`, fetched its page with `curl`, and started
  a chmod Arcade round, with no console errors.
- Limitations: only the listed Docker commands and images; a few commands inside containers; no interactive
  container shells yet.

## 2026-10-11T02:07:45+05:30 — AI tutor (Vasi)

- Changed:
  - New `packages/tutor`: the agent loop (`TutorSession`), tools that run through the kernel as the `tutor`
    actor, autonomy levels mapped to capability grants, tools generated from module actions, a snapshot of
    the learner's recent commands with each question, a cap of 8 model calls per question, and an HTTP
    transport with plain-language errors.
  - New `apps/api`: a dependency-free Node server (`npm run api`) with `/api/health` and `/api/tutor`. It
    holds the OpenAI key, adds the tutor's instructions, validates requests, rate-limits per client and
    turns upstream failures into readable errors. `.env.example` lists its settings.
  - Desktop: the Vasi puppet and chat panel, an autonomy switch, tool actions shown inline, a highlight for
    things Vasi points at (lifting icons above windows), and a help nudge after two failed commands. The
    Vite dev server forwards `/api` to the API server.
  - System client: `tutor()` access with its own shell, app opening, capability grants and recent events.
  - Lesson checks now count only the learner's actions, so the tutor's demonstrations don't complete steps.
  - Actions can describe their parameters (`params`), which become the generated tools' schemas.
- Why: The tutor puppet with real but limited control of the system is the core of the project's design.
- Validation: `npm run check` — type check passed; Vitest reported 18 test files and 217 tests passed,
  including scripted-model tutor tests against a real system and UI tests. `npm run build` passed. The API
  server was started and its health, missing-key, bad-JSON and 404 responses checked with curl. In Chromium,
  through the dev server and the API server pointed at a local stand-in for the OpenAI API: two failed
  commands showed the nudge, and asking Vasi checked recent commands, highlighted the Terminal icon and
  answered, with no console errors.
- Limitations: not yet run against a real OpenAI model here (no key in this environment); no long-term
  learner memory; the in-memory rate limit is per server process.

## 2026-10-11T01:54:26+05:30 — Lesson engine and Learn Linux

- Changed:
  - New `packages/lessons`: course types, a validator, condition checks and a `LessonRunner` that advances
    steps from kernel events and file state, saves progress, and only counts events after a step began.
  - New `modules/learn-linux`: six JSON lessons with hints and explanations, a lessons window, and
    status/start/quit/reset kernel actions; progress is a file in the learner's home.
  - Shell: every command line is logged as a `shell.ran` event (line, cwd, exit code, capped output,
    command names), and `chmod` accepts `+x` and comma-separated clauses.
  - Kernel: acting as another user now requires `user:switch`; `/dev/null`; and a fix so changes made by
    actions dispatched from inside a read-only action are no longer discarded.
  - Modules can watch kernel events (`ctx.onEvent`, cleaned up if activation fails) and know the learner's
    username (`ctx.user`).
- Why: Lessons are the core of learning here, and the tutor phase needs both lesson state and a log of what
  the learner typed. Replaying each lesson's solution in tests caught the kernel nested-dispatch bug.
- Validation: `npm run check` — type check passed; Vitest reported 15 test files and 186 tests passed,
  including a replay of every lesson's solution. `npm run build` passed. In Chromium: started a lesson from
  the Learn Linux window, ran `whoami` and `pwd` in the terminal, and the window ticked both steps off and
  showed the explanation, with no console errors.
- Limitations: lesson content is English only; checks read files as the learner, so they cannot inspect
  files the learner cannot read.

## 2026-10-11T01:44:48+05:30 — Terminal, Files and Text Editor apps

- Changed:
  - Shell: a shared command registry so each terminal window has its own shell (cwd, env, history) while
    module commands work in all of them; Tab completion of commands and paths; command history.
  - Kernel: windows remember what they were opened with (`args`), a `session.setTitle` action, a welcome
    `/etc/motd`, and a root-only `/etc/shadow`.
  - System client: saving no longer makes commands wait for the 500 ms debounce; storage failures go to
    `onSaveError` listeners and `flush()`. Added per-terminal sessions with prompt, completion and history.
  - New modules: Terminal (xterm.js, a tested line editor, `clear`, `exit`), Files and Text Editor.
  - Desktop: SVG app icons, Ctrl+Alt+T, minimized windows stay mounted so apps keep their state, apps fill
    their windows, a close guard for unsaved work, a proper `index.html`, and xterm pre-bundled in dev.
  - Fixed: the boot screen's timer sent a learner who skipped boot and logged in quickly back to login.
- Why: Give learners the three core apps (terminal, file manager, editor) as plain modules on the desktop,
  and fix problems found by driving the app in a real browser.
- Validation: `npm run check` — type check passed; Vitest reported 13 test files and 144 tests passed.
  `npm run build` passed, with each app's code in its own lazily loaded chunk. Drove the dev server in
  Chromium: login, Ctrl+Alt+T, `ls -la`, Tab completion, redirection, Files navigation, opening and saving
  a file in Text Editor, and the edit visible from the restored terminal, with no console errors.
- Limitations: `ls -l` shows UTC times; long edited lines redraw imperfectly; stderr is shown after stdout.

## 2026-10-11T01:25:54+05:30 — Desktop event stream and window interaction fixes

- Changed:
  - Made `SystemClient.session()` read a cloned kernel session directly and added filtered `onChange` listeners.
  - Removed recursive desktop refreshes caused by dispatching `session.list` while handling kernel events.
  - Split the web app into screens, desktop controls and pointer/session hooks.
  - Added cached lazy view components, captured drag/resize interactions, position clamping, maximize/restore,
    focus filtering and a 30-second panel clock.
  - Added a separately exported About manifest and dynamic module loading; Vite emits separate module/view chunks.
  - Added real-client integration and window-manager interaction coverage.
- Why: Make the real desktop stable under kernel events and match the requested window-manager behavior.
- Validation: `npm run check` — TypeScript passed; Vitest reported 8 files and 92 tests passed. `npm run build`
  — TypeScript passed and Vite emitted separate JavaScript chunks for the module and view.
- Limitations: The system remains on the main thread; the AI tutor and additional modules are not implemented.

## 2026-10-11T01:18:26+05:30 — Browser desktop, sessions and local system client

- Changed:
  - Added kernel session state and window actions with focus, z-order, movement, resize clamping,
    minimize/maximize, close, listing and legacy snapshot support.
  - Added `@ayalvasis/system` with boot/restore, injected debounced persistence, module activation,
    terminal sessions and session APIs.
  - Added the Vite/React web desktop, boot/login flow, launcher, accessible window controls and lazy views.
  - Added the About module with an app, `uname`, `uname -a` and a system-information view.
  - Added kernel, system and browser interaction tests and updated workspace build scripts.
- Why: Deliver the first runnable browser desktop while keeping all state changes in the kernel contract.
- Validation: `npm run check` — TypeScript passed; Vitest reported 8 files and 88 tests passed. `npm run build`
  — TypeScript passed and Vite produced the web bundle.
- Limitations: The system is still on the main thread; the AI tutor, additional modules and production deployment
  are not implemented.

## 2026-10-11T00:44:50+05:30 — Permission-bound module filesystem access and rollback

- Changed:
  - Added `ActionContext.fs` helpers backed by the same VFS permission checks as built-in `fs.*`
    actions, and removed the raw `writeFile` export from `@ayalvasis/kernel`.
  - Added `Kernel.unregister` and `Kernel.revoke`; failed module activation now removes registered
    actions and commands and revokes the module actor's grant.
  - Allowed app ids and command names to share a namespace-free value, updated the notes and partial-
    failure fixtures, and added tests for user/root access and cleanup.
- Why: Prevent modules from bypassing acting-user permissions and avoid leaving partial module state
  after activation fails.
- Validation: `npm run check` — TypeScript typecheck passed; Vitest reported 6 test files and 78 tests passed.
- Limitations: The browser UI, production modules and tutor are not implemented yet.

## 2026-10-11T00:41:00+05:30 — Lazy module host and activation SDK

- Changed:
  - Added `@ayalvasis/module-host` with manifest validation, per-host lifecycle state, lazy shell
    command stubs, dependency activation, capability grants, app activation and host events.
  - Extended the SDK with activation events, module contexts, module definitions and `defineModule`.
  - Added hello, notes, throwing and missing-command fixtures plus 19 module-host contract tests.
  - Updated the README architecture/status and workspace lockfile for the new package.
- Why: Make Terminal, Files, Learn Linux, Learn Docker and games independently loadable modules whose
  manifests are the only integration point required by the core.
- Validation: `npm run check` — TypeScript typecheck passed; Vitest reported 6 test files and 75 tests passed.
- Limitations: The browser UI, production modules and tutor are not implemented yet.

## 2026-10-11T00:37:34+05:30 — Parser and multi-file text command fidelity

- Changed:
  - Corrected double-quoted backslash handling to preserve non-special escapes while
    allowing Bash’s special double-quote escapes.
  - Added Bash-compatible multi-file behavior for `cat`, `sort`, `head`, `tail`, and `wc`;
    grep multi-file prefixes remain covered.
  - Added parser, double-quoted echo, and multi-operand regression tests.
- Why: Match Bash quoting and GNU text-command behavior when learners use realistic pipelines
  and more than one input file.
- Validation: `npm run check` — TypeScript typecheck passed; Vitest reported 5 test files
  and 56 tests passed.
- Limitations: This remains the focused command subset documented above.

## 2026-10-11T00:36:20+05:30 — Echo and stdin operand fidelity

- Changed:
  - Restored Bash-compatible `echo` behavior: `-n`, `-e`, `-E`, combined options,
    escapes, octal values, and `\c` termination.
  - Made lone `-` read standard input for `cat`, `head`, `tail`, `wc`, `sort`, and `grep`.
  - Added regression tests and wrapped the remaining long executor assertion.
- Why: Option validation must not change Bash echo semantics, and learners commonly pipe
  text through commands using `-` as the stdin operand.
- Validation: `npm run check` — TypeScript typecheck passed; Vitest reported 5 test files
  and 54 tests passed.
- Limitations: This remains the focused command subset documented above.

## 2026-10-11T00:34:18+05:30 — Shell option and listing fidelity fixes

- Changed:
  - Corrected `ls -l` block totals to use 4 KiB allocation units.
  - Added supported-option validation for every built-in, GNU diagnostics, Bash-style
    `cd` and `export` errors, and `--` operand handling.
  - Added `ls -d` for listing directory operands themselves.
  - Wrapped kernel test expectations to keep test source lines within 120 characters.
- Why: Match the supported shell's option parsing and directory listing behavior more
  closely to GNU tools and Bash.
- Validation: `npm run check` — TypeScript typecheck passed; Vitest reported 5 test
  files and 52 tests passed.
- Limitations: Unsupported commands and options remain outside this focused teaching-shell subset.

## 2026-10-11T00:27:06+05:30 — GNU filesystem fidelity and modification times

- Changed:
  - Added deterministic `mtime` values to kernel files, directories, stats and snapshots,
    including legacy snapshot backfill.
  - Updated filesystem mutations so writes, creates and parent directory entry changes
    follow Linux-style timestamp behavior.
  - Added errno-based GNU diagnostics with typed shell paths, directory-target `cp`/`mv`,
    and directory self-move protection.
  - Improved `ls` hidden-entry ordering, byte sorting, long-format metadata, UTC dates,
    link counts, totals and alignment.
  - Added regression tests for timestamps, snapshot compatibility, diagnostics, copy/move behavior and listing formats.
- Why: Learners compare the pretend shell with a real GNU/Linux terminal, so supported
  behavior must expose familiar output and metadata.
- Validation: `npm run check` — TypeScript typecheck passed; Vitest reported 5 test files and 50 tests passed.
- Limitations: This remains the focused command subset documented above; unsupported Bash and GNU options are unchanged.

## 2026-10-11T00:02:14+05:30 — Bash-like teaching shell final fixes

- Changed:
  - Added `packages/shell` with the public `createShell` API and workspace manifest.
  - Reworked the parser to preserve quoted segments and defer variable, status, tilde and glob expansion until each command executes.
  - Fixed parser progress for lone dollar signs and added bounded prefix termination coverage for tricky incomplete inputs.
  - Improved syntax diagnostics with the unexpected token and handled bad substitutions as exit status 1.
  - Fixed grep filename prefixes to appear only for multiple files or recursive searches.
  - Split built-ins into navigation, files, text and system command modules, with true and false included.
  - Added user-aware command context, root-aware sudo, duplicate registration errors, kernel `resolvePath` usage and the named `RunResult` type.
  - Split tests into parser, executor and command suites covering regressions, options, permissions and module registration.
  - Updated `README.md` and `AI_USAGE.md`.
- Why: Give the browser Linux system a safe, teachable command-line layer while preserving the kernel as the sole owner of filesystem state.
- Validation: `npm run check` — `tsc -p tsconfig.json` passed; Vitest reported 5 test files and 45 tests passed.
- Limitations: This is a focused Bash-like subset; group permissions, complete GNU edge cases, and a UI/module host remain outside the package.

## 2026-10-10T23:41:17+05:30 — Workspace, SDK contracts and kernel core

- Changed:
  - Added an npm workspace (`package.json`, `tsconfig.json`).
  - Added `packages/sdk` with shared types: Action, Actor, Capability, KernelEvent, ModuleManifest.
  - Added `packages/kernel`:
    - `dispatch` with capability checks, an event log, subscribers and snapshots
    - a virtual filesystem with Unix permissions
    - built-in `fs.*` actions
    - Vitest tests
  - Added build outputs to `.gitignore`.
  - Documented the architecture, commands and status in `README.md`.
- Why: Everything else depends on these contracts. The learner, modules and the AI tutor will all change the system through the same `dispatch` call, so it has to be correct and tested before the shell, UI and tutor are built on it.
- Validation: `npm run check` — the type check passed and 22 of 22 tests passed (`vfs.test.ts`, `kernel.test.ts`).
- Limitations:
  - No group permissions.
  - Each state-changing action copies the whole state.
  - No shell, UI, module host or tutor yet.

## Template setup — 10 October 2026

- Changed: Added the event README, rules, agent guide, change log, AI usage record, submission checklist, Git ignore rules, and pull request checklist.
- Why: Give participants a consistent starting point for event rules, basic coding patterns, documented changes, and regular commits.
- Validation: Checked local Markdown links, event detail consistency, required documents, and diff whitespace before publishing.
- Limitations: Documentation scaffolding only; no participant project, application, or working demo is included. GitHub publication and template status are verified separately after creation.
