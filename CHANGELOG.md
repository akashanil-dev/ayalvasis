# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

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
