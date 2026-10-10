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

- **Project name:** TODO
- **Short description:** A pretend Linux computer that runs in the browser and teaches newcomers Linux and its ecosystem. An AI tutor guides each learner and can operate the system itself. Every activity (Learn Linux, Learn Docker, games) is a module that shows up as a desktop icon.
- **Team:** TODO — participant names and GitHub handles; maximum 4 members.
- **Working demo:** TODO — link or local demo instructions.
- **Technology stack:** TypeScript, npm workspaces, Vitest.

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
- **Module host** (`packages/module-host`): validates manifests, registers lazy command stubs,
  activates dependency chains, grants declared capabilities, and reports activation state/events.
  It depends on the kernel and shell; adding a module only requires registering its manifest and
  loader with the host.
- **System client** (`packages/system`): the single UI-facing API for boot, persistence, events,
  sessions, terminals and module activation. Session reads are direct cloned state reads, while `onChange`
  reports successful mutations. It runs on the main thread for now; a Web Worker is planned.
- **Web app** (`apps/web`): a Vite + React desktop with boot/login screens, module icons, a launcher,
  clock, kernel-backed windows and lazy app views.
- **Modules** (`modules/*`): each one adds desktop apps and shell commands through a manifest. The About
  module proves app activation, `uname`, and a view reading system information through dispatch.

### Run the project

1. Prerequisites and versions: Node.js 20 or newer (developed on Node 26.7, npm 11.19).
2. Dependency installation: `npm install`
3. Environment setup: none needed yet.
4. Start the project: `npm run dev`, then open the URL printed by Vite (normally `http://localhost:5173`).
5. Run checks or tests: `npm run check` (TypeScript type check, then the Vitest suite). `npm test` runs only the tests.

### Current status

- Working features:
  - **Browser desktop:** boot/login flow, saved-system continuation, CSS wallpaper, module app icons,
    launcher, clock, lazy About view and accessible kernel-backed windows.
  - **System client:** local in-process boot/restore, debounced injected-storage persistence, event
    subscriptions, module activation, session API and terminal API. A Web Worker is planned.
  - **About module:** contributes the About app and `uname` command, including `uname -a` hostname output.
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
  - Each state-changing action copies the whole state, which is fine at learner-sized filesystems; this can be revisited if it gets slow.
  - The shell intentionally implements only the command/options listed in its package task; it is not a complete Bash or POSIX shell.
  - Some GNU formatting and shell-language edge cases remain simplified for the teaching filesystem;
    long listings use the virtual filesystem's fixed UTC clock values.
  - The module host and SDK contract are implemented, with hello, notes, failure, and missing-command
    fixtures proving the contract. Failed module activation rolls back registered actions, commands
    and capability grants.
- Libraries, APIs, and public datasets used: [TypeScript](https://www.typescriptlang.org/),
  [Vitest](https://vitest.dev/), [React](https://react.dev/) and [Vite](https://vite.dev/). No public
  datasets or external APIs are used.

See [AI_USAGE.md](AI_USAGE.md) for AI assistance and [CHANGELOG.md](CHANGELOG.md) for the development record.
