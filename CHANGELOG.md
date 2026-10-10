# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

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
