# AI usage record

Use Codex during the hackathon and briefly document its actual contribution here. Add a row after each meaningful task or milestone. Keep summaries concise and omit secrets, private data, and full chat transcripts.

## Event build log

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
