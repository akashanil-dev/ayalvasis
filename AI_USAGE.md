# AI usage record

Use Codex during the hackathon and briefly document its actual contribution here. Add a row after each meaningful task or milestone. Keep summaries concise and omit secrets, private data, and full chat transcripts.

## Event build log

| 2026-10-11T05:00:28+05:30 | AI coding assistant | Vasi as a teaching agent | Designed and implemented the teacher persona, agent tools, screen agent with drawn pointer, sudo request dialog, Stop control, terminal typing channel, sudo option fix and tests across `packages/tutor`, `apps/web`, `apps/api`, `modules/terminal` and `packages/shell`. | Pending | `npm run typecheck` passed; 24 test files and 270 tests passed; `npm run build` passed; agent flow checked in headless Chromium against a scripted model stand-in. |

| 2026-10-11T05:29:29+05:30 | Codex | Reduce Linux syllabus planning payload | Removed irrelevant cached history from planning; scope hint/answer context to three short entries for the active task. | Pending | `npm run check` passed (23 test files, 259 tests); `npm run build` and `git diff --check` passed; local API health responded configured. No live model call. |

| 2026-10-11T05:24:23+05:30 | Codex | One-command Linux learning loop | Tightened AI plan/evaluation prompts, reject chained-command answers, prevent previous attempts from affecting correctness, and version the Linux local plan path to preserve older cached data. | Pending | `npm run check` passed (23 test files, 257 tests); `npm run build` and `git diff --check` passed. |

| 2026-10-11T05:20:49+05:30 | Codex | Clarify Linux mission and terminal coaching | Added a purple Bitcount Grid Double Ink mission header with a small Linux penguin and recap/new indicator; also made answers/assessments concise and cumulative per task. | Pending | `npm run check` passed (23 test files, 256 tests); `npm run build` and `git diff --check` passed. |

| 2026-10-11T05:13:38+05:30 | Codex | Fix Linux/Docker trainer cross-talk | Replaced the singleton current trainer with module-keyed runners, passed the owning module into learning terminals, and added explicit recap/new task labeling to the Linux terminal header. | Pending | `npm run check`: 23 test files and 255 tests passed; `npm run build` and `git diff --check` passed. Cross-module regression confirms Linux `/answer` remains Linux after Docker is active. |

| 2026-10-11T05:06:11+05:30 | Codex | Make Linux assessment compact and cost-conscious | Routed Linux learning to a small model by default, constrained and capped Linux terminal assessment feedback at 110 characters, and preserved detailed `/answer`; updated configuration and usage docs. | Pending | `npm run check`: 23 test files and 254 tests passed; `npm run build` and `git diff --check` passed; no live model call made. |

| 2026-10-11T04:55:20+05:30 | Codex | Fix AI syllabus recap validation failure | Clarified task-level recap output and enforced it in API/client validation; added API and Linux regression tests plus pending-status refresh. | Pending | `npm run check`: 23 files and 254 tests passed; `npm run build` passed; focused tutor-panel rerun passed. Live AI call not yet rechecked. |

| 2026-10-11T04:46:25+05:30 | Codex | Handle pending Linux syllabus state | Deduplicated concurrent syllabus generation and made the retry control show a busy state until the request resolves. | Pending | 23 test files and 252 tests passed; production build and diff check passed. |

| 2026-10-11T04:44:47+05:30 | Codex | Diagnose Linux trainer unavailable state | Added visible plan-error diagnostics and retry, normalized model course IDs, and validated generated syllabus structure. | Pending | `npm run check`: 23 files and 252 tests passed; build and diff check passed. Live localhost API was inaccessible in the sandbox. |

| 2026-10-11T04:41:44+05:30 | Codex | Fix AI learning local startup | Updated `npm run dev` to start both the server-side AI API and Vite, documented the startup contract, and preserved server-only credential handling. | Pending | Existing project checks had passed before this startup-only change. |

| 2026-10-11T04:39:39+05:30 | Codex | Strict AI Linux terminal lab | Replaced the Linux dashboard with a real xterm terminal and `#` task comments, enforced AI-only syllabus/evaluation for Linux, and enabled terminal-native `/hint` and `/answer`. | Pending | `npm run check`: 23 files and 252 tests passed; `npm run build` passed; `git diff --check` passed. |

| 2026-10-11T04:30:13+05:30 | Codex | Connect chmod to adaptive learning | Added chmod's AI course runner, security trainer persona, reviewed fallback syllabus, and dynamic task text alongside its terminal and permission visualization. | Pending | `npm run check`: 23 files and 257 tests passed; `npm run build` passed; `git diff --check` passed. |

| 2026-10-11T04:29:13+05:30 | Codex | Terminal-first learning lab frontend | Added embedded task-first terminal labs for Linux and Docker, Docker engine visualization, and a chmod terminal workspace beside the existing permission visualization. | Pending | `npm run check`: 23 files and 257 tests passed; `npm run build` passed; `git diff --check` passed. |
| 2026-10-11T04:10:23+05:30 | Codex | AI-designed terminal learning backend | Added server-side syllabus generation/evaluation endpoints, Linux/Docker trainer personas, persistent AI course state, terminal slash commands, structured validation, and deterministic fallback compatibility. | Pending | `npm run check`: 22 files and 250 tests passed; `npm run build` passed. |
| 2026-10-11T04:14:36+05:30 | Codex | Module-local learning memory and model routing | Added bounded per-module memory cache, memory-aware AI requests, and independent environment-configurable model selection. | Pending | `npm run check`: 22 files and 251 tests passed; `npm run build` passed; `git diff --check` passed. |

| 2026-10-11T04:11:58+05:30 | AI coding assistant | UI redesign and CDE/Hyprland desktops | Implemented the new design tokens and styles, CDE and Hyprland shells, dtlogin and tuigreet, tiling and workspaces, themed icons and wallpapers, Settings redesign and tests across `apps/web`, `packages/appearance` and modules. | Pending | `npm run typecheck` passed; 22 test files and 252 tests passed; `npm run build` passed; screenshots checked in headless Chromium. |

| 2026-10-11T01:25:54+05:30 | Codex | Desktop phase review fixes | Removed recursive session reads, added filtered change events, split desktop components, implemented captured window interactions, cached lazy views, dynamic module loading and integration tests. | Pending | `npm run check` passed: 8 files and 92 tests. `npm run build` passed with separate module/view chunks. |

| 2026-10-11T01:18:26+05:30 | Codex | First runnable browser desktop | Added kernel sessions, SystemClient, About module, Vite/React web app, persistence and tests across packages, modules and apps. | Pending | `npm run check` passed: 8 files and 88 tests. `npm run build` passed with a Vite bundle. |

No participant AI usage has been recorded yet. Replace the placeholder row as you build. Mark human review as pending until someone has reviewed the contribution.

| Date and time with timezone | Tool / model, if known | Task | Assistance and affected files | Human review / corrections | Validation and result |
| --- | --- | --- | --- | --- | --- |
| 2026-10-11T00:44:50+05:30 | Codex | Review fixes for module permissions and rollback | Added permission-bound `ActionContext.fs`, kernel unregister/revoke lifecycle cleanup, partial-failure coverage, and app/command namespace correction. | Pending | `npm run check` passed; 6 test files and 78 tests passed. |
| 2026-10-11T00:41:00+05:30 | Codex | Module host and SDK activation contract | Added SDK module contracts, the module-host package, lazy stubs, dependency/capability handling, fixtures, tests and docs. | Pending | `npm run check` passed; 6 test files and 75 tests passed. |
| 2026-10-11T00:37:34+05:30 | Codex | Parser and multi-file fidelity | Fixed double-quote escapes, multi-file text commands, and added tests. | Pending | 56 tests passed. |
| 2026-10-11T00:36:20+05:30 | Codex | Echo and stdin fidelity | Added Bash echo escapes/options, stdin `-` operands, and regression tests. | Pending | 54 tests passed. |
| 2026-10-11T00:34:18+05:30 | Codex | Shell fidelity review | Totals, options, `ls -d`, and tests. | Pending | 52 tests passed. |
| 2026-10-11T00:27:06+05:30 | Codex | GNU/Linux fidelity | Added mtimes, diagnostics, `ls`, `cp`/`mv`, and tests. | Pending | `npm run check`: 50 tests passed. |
| 2026-10-11T00:02:14+05:30 | Codex | Build and review the browser Linux teaching shell | Built `@ayalvasis/shell` including its parser, executor, built-ins, and tests; then performed the review-driven rework with a quote-aware parser and deferred expansion, user-aware sudo, command files split by responsibility, the lone-`$` hang fix, token-specific syntax errors, and GNU-style grep filename prefixes. | Pending | `npm run check` passed: TypeScript typecheck and 45 Vitest tests. |

## Template preparation

On 10 October 2026, Codex prepared this documentation template from the organizer's supplied rules and checked the linked Luma page for the event name and dates. This covered `README.md`, `RULES.md`, `AGENTS.md`, `CHANGELOG.md`, `AI_USAGE.md`, `SUBMISSION.md`, `.gitignore`, and the pull request checklist. Agent validation covered local links, event consistency, required documents, and diff whitespace; organizer review is pending.

This preparation is separate from participant project implementation and participant AI usage during the event.
