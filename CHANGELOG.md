# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-11T08:44:00+05:30 — No password-only screen flash after signing in

- Changed: `apps/web/src/app.tsx` now records the signed-in account in the same update that switches to the
  desktop, instead of before booting the system. Added a regression test in `apps/web/src/accounts.test.tsx`.
- Why: The greeter is keyed on the account, so setting it early remounted the sign-in or sign-up form as the
  password-only "Continue" unlock screen, which showed for as long as the system took to boot.
- Validation: the new test failed before the fix and passes after it; `npm run check` passed (295 tests).
- Limitations: checked in tests only, not yet in a browser or on the live site.

## 2026-10-11T08:31:00+05:30 — Trainers guide learners to the answer instead of giving it

- Changed:
  - `packages/lessons/src/ai.ts` counts wrong attempts per task (saved with progress, cleared on reset) and sends
    the count with evaluate, hint and answer requests. `/answer` and Show answer give a nudge and say how many
    tries are left until five wrong attempts, then show the answer and ask the learner to type it. Hints get a
    step more specific each time, including the offline fallback, which walks through the task's own hints.
  - `apps/api/src/learning.ts`: corrections only nudge for the first four misses; from the fifth they reveal
    the command name, then its option, then the full line with encouragement. A guard replaces any early
    correction that still contains the answer with a hint that does not. The failure count is validated.
  - `modules/terminal/src/manifest.ts` and README describe the new `/answer` behaviour.
- Why: Learners were being told "Run exactly: ls -la" on their first wrong try. The team wants learners to reach
  the answer themselves, with the answer revealed slowly only after five or more failures.
- Validation: `npm run check` passed (294 tests), with new tests for the gated `/answer`, the early-answer guard,
  the reveal prompt after five misses, and failure-count validation. Not checked against the live model.
- Limitations: the guard only catches the answer written out in full; a model could still describe it in other
  words, which the prompt forbids. The Vasi tutor is a separate agent and is not bound by the five-try rule.

## 2026-10-11T08:13:00+05:30 — Learn Linux syllabus no longer thrown away over one flawed task

- Changed: `apps/api/src/learning.ts` now repairs a generated syllabus instead of rejecting it whole. Tasks that
  are incomplete or (for Linux) chain several commands are dropped and logged; days left empty are removed; day
  numbers and recap markers are set from position. The one-command check ignores `;` that is escaped
  (`find … -exec … \;`) or quoted (`awk '{print $1; }'`). A plan with no usable task is still a 502.
- Why: Production Learn Linux waited for the model (about a minute in a live test) and then returned HTTP 502,
  because a single off recap marker or a legitimate `\;` in any of ~25 tasks rejected the whole syllabus, and
  Learn Linux has no offline fallback.
- Validation: `npm run check` passed (292 tests), including new tests for dropping chained-command tasks, keeping
  `\;` and quoted `;` answers, rejecting a plan with no usable tasks, and repairing recap markers. Reproduced the
  live 502 with curl; the server journal was not read, so which rule fired in production is inferred from the code.
- Limitations: a first task that is renumbered as the recap may not actually review an earlier skill. Generation
  still takes up to about a minute. Not yet deployed or rechecked against the live model.

## 2026-10-11T07:53:16+05:30 — Documentation brought up to date

- Changed:
  - README: corrected the sudo description (real account password; guests only confirm), the Node requirement
    (22.18 or newer, also in `package.json` engines), Learn Linux having no offline fallback, and the terminal
    palette; added accounts, unlock, session restore, teach-first labs, themed course windows, Vasi's walk and
    introduction, the live demo link, and credits for fonts and icon themes; updated the AI-testing limitation.
  - SUBMISSION.md: filled in the project, repository, final implementation commit, demo, run steps, walkthrough,
    checks, limitations and libraries. The team table and the checklist are left for the team to complete.
  - CHANGELOG.md and AI_USAGE.md: entries sorted newest first (merges had left some out of order) and every AI
    usage row moved under its table header so the table renders; no entry was changed.
- Why: The team asked for the documentation to be complete and correct before submission.
- Validation: each README claim was checked against the code (scripts, course fallbacks, models, deployment);
  the reordering was checked to keep every line; `npm run check` passed (291 tests).
- Limitations: team names and GitHub handles are still TODO in README and SUBMISSION.md.

## 2026-10-11T07:48:15+05:30 — Teach first, then test; clearer trainer feedback

- Changed:
  - Every task in Learn Linux, Learn Docker and chmod Arcade starts with a "Learn first" lesson (the concept, the
    command and an example in code), and the task appears when the learner presses "I'm ready — let me try";
    "Review the lesson" brings it back. Which lessons were read is remembered in the browser.
  - The AI trainer now writes a `teach` lesson for every task (plan prompt in `apps/api/src/learning.ts`); older
    syllabuses fall back to each task's explanation.
  - The trainer's verdict is no longer glued onto the command's output as "[Trainer] …". It travels as its own
    `feedback` field (`TerminalResult` in `packages/system`), and terminals show it clearly: a coloured, wrapped
    "✓ Correct!" / "✗ Not quite" block with what to do next in the Linux terminal, and a green or red card in the
    Docker and Arcade lab terminals.
- Why: Learners were tested before being taught, and the feedback was hard to read.
- Validation: `npm run typecheck` passed; 26 test files and 291 tests passed (new: feedback formatting; the course
  test now checks the verdict field and the lesson text). In Chromium with a test syllabus: the lesson card, then a
  wrong `ls` showing the "Not quite" block.
- Limitations: Learn Linux feedback is still cut at 110 characters (the trainer is asked to stay under that). Vasi's
  first-meeting bubble can cover the lab's "I'm ready" button until it is closed.

## 2026-10-11T07:40:45+05:30 — Vasi walks sideways and rests facing you

- Changed: Vasi has a side view for walking (facing the way he goes, mirrored for left) with a forward-leaning strut
  and stepping feet, and turns to face the learner when he rests. Walks and rests are random: a random spot along the
  bottom, then a 3–9 second rest. Clicking him (or anything that needs him) sends him hurrying back to his corner.
  (`apps/web/src/tutor/Puppet.tsx`, `useStroll.ts`, `styles/tutor.css`)
- Why: He used to walk facing forward, and took long to come back when called.
- Validation: `npm run typecheck` passed; 26 test files and 290 tests passed. In Chromium: side view while walking,
  front view while resting, and a click sent him home (2.4 s from the far left).
- Limitations: none known.

## 2026-10-11T07:34:03+05:30 — Vasi in 3D: he walks, and introduces himself

- Changed:
  - Vasi is redrawn as a shaded, rounded penguin (lit from the top left, glossy eyes, a soft shadow and a
    teacher's graduation cap), built from separate parts so CSS can animate him (`apps/web/src/tutor/Puppet.tsx`).
  - He strolls along the bottom of the screen when nobody needs him: a penguin waddle with alternating steps,
    swinging wings and eyes looking where he is going; he walks home and faces the learner whenever his chat,
    a nudge, his introduction, a sudo request or his own work needs him (`useStroll.ts`). Reduced motion keeps
    him still.
  - The first time a learner meets him, he introduces himself in a speech bubble and answers questions about
    what he can teach, using the computer, watching your work, sudo and how to stop him; "Let's start learning"
    opens Learn Linux and "Ask me something" opens his chat. "About me" in his chat brings it back (`VasiIntro.tsx`).
- Why: The team wants Vasi to feel like a teacher living in the computer, and new learners to know what he can do.
- Validation: `npm run typecheck` passed; 26 test files and 290 tests passed (new: the introduction shows once and
  sends nothing to the AI; "Let's start learning" opens Learn Linux). In Chromium: the introduction, an answer, and
  Vasi mid-walk were screenshotted.
- Limitations: "3D" is shaded 2D artwork, not a 3D model. The introduction is remembered per user in this browser.

## 2026-10-11T07:26:17+05:30 — Learn Linux, Learn Docker and chmod Arcade follow each desktop's theme

- Changed:
  - Learn Linux's mission header is easier to read and act on: the day and a "New skill"/"Recap" badge, "Task n of m"
    with progress dots, the scenario in plain text, the task in a highlighted "Your task" card, and Hint and Show
    answer buttons (they type `/hint` and `/answer` into the lab's terminal). The hard-to-read pixel font is gone, and
    its Google Fonts download removed.
  - Learn Docker: a course progress bar, "Day n · Task n of m" with a recap badge, the same "Your task" card, shorter
    button labels, and the terminal and engine panel now fill the window instead of leaving empty space.
  - chmod Arcade: a "Your task" banner, score/streak/best/time tiles with a countdown bar, and themed game controls.
  - All three use the desktop's own colours (Breeze, Adwaita, CDE Motif with bevels, Catppuccin for Hyprland) instead
    of their own fixed navy and purple palettes; their terminals stay dark, like real terminal apps.
    (`packages/course-view`, `modules/chmod-arcade`, `modules/terminal` gained an `inputId` for typed commands.)
- Why: The labs looked out of place in every desktop, and the Linux task was hard to read and act on.
- Validation: `npm run typecheck` passed; 26 test files and 288 tests passed (a slow launcher check got the same longer
  wait as its neighbours). Screenshots in Chromium of Learn Linux and Learn Docker in KDE and CDE, and chmod Arcade in
  KDE, from the dev server with a fixed test syllabus.
- Limitations: Edson's KDE-only Docker rules (`.de-plasma .docker-*`) are kept but still have no markup to style.

## 2026-10-11T07:13:33+05:30 — Password on unlock, and a realistic Plasma splash

- Changed:
  - Unlocking the screen, or coming back to a still-signed-in account after a restart, now asks for the account's
    password, checked by the server; a wrong one shows "Wrong password. Try again." Guests are unchanged.
  - The KDE Plasma splash looks like Breeze's: the Plasma logo fades in on a dark background, a thin bar fills in
    uneven steps like ksplash's start-up stages, "Plasma · made by KDE" sits at the bottom, and the splash fades
    into the desktop while the panel slides up.
- Why: Anyone at the computer could resume a signed-in account without a password; the old splash didn't look like Plasma.
- Validation: `npm run typecheck` passed; 26 test files and 288 tests passed (the account test now checks a wrong
  and a right password when continuing). Splash checked in a screenshot from a production build in Chromium.
- Limitations: none known.

## 2026-10-11T06:58:38+05:30 — Accounts, faster desktop icons and a clearer AI course start

- Changed:
  - Accounts with a username and password (`apps/api/src/accounts.ts`): register, sign in, sign out, "who am I",
    password check, and saved progress per account in SQLite (`node:sqlite`, no new dependencies). Passwords are
    salted scrypt hashes; sessions are 30-day random tokens in an HttpOnly, SameSite=Lax, Secure cookie, stored
    hashed. Saves carry a version so a stale tab or device gets a conflict instead of overwriting newer progress.
    Sign-in attempts are rate-limited per visitor; account requests must be JSON (blocks cross-site form posts).
  - All four login screens offer Create account, Sign in, "Continue as <name>" for a signed-in browser, and
    "Try without an account" (progress stays in the browser, as before). A guest who signs up with the same name
    brings their progress into the account. Logging out saves, then ends the account's session.
  - Vasi's sudo dialog checks the signed-in account's real password ("Sorry, try again." otherwise); guests have no
    password, so they only confirm.
  - Desktop icons and the wallpaper are fetched while the login screen and desktop splash are showing, instead of
    popping in after the desktop appears.
  - Learn Linux shows that the AI trainer is generating the lab (with a cursor) instead of "AI trainer unavailable"
    while its syllabus is being planned.
  - Deployment: the API gets `/var/lib/tuxos` (systemd `StateDirectory`) and `DATABASE_PATH`; `setup-server.sh`
    adds it to existing servers. CI now starts the API with Node itself, since production runs its TypeScript by
    type stripping, which rejects syntax (constructor parameter properties) that the test runner accepts.
- Why: Learners asked to keep their progress across devices; login icons appeared late; Learn Linux looked broken
  while it was still loading.
- Validation: `npm run typecheck` passed; 26 test files and 288 tests passed (new: 7 account service tests, 6 app
  account-flow tests, real-password and guest sudo tests). With the real API and dev server: account register,
  session, save, password check and refusal of a form post checked with curl; in Chromium, an account created in
  one browser profile saved a file, and a second, fresh profile refused a wrong password, signed in and read the file.
- Limitations: no password reset (by design). Not yet deployed: the server needs `setup-server.sh` re-run first.
  Guest progress moves into an account only when the names match.

## 2026-10-11T06:33:24+05:30 — Make Learn Linux's syllabus finish within Cloudflare's limit

- Changed: reasoning models (GPT-5, o-series) are asked for `reasoning_effort: "low"` when the learning API calls them;
  the API now allows the AI 90 seconds (was 60) and the browser waits up to 100 seconds (was 75)
  (`apps/api/src/learning.ts`, `packages/system/src/index.ts`).
- Why: After the temperature fix, Learn Linux's seven-day syllabus on `gpt-5.6-luna` took over 60 seconds in
  production and timed out (HTTP 504). Cloudflare stops proxied requests at 100 seconds, so a longer timeout alone
  could not fix it.
- Validation: `npm run typecheck` passed; 24 test files and 274 tests passed (the model test now also checks
  `reasoning_effort`). Not yet measured on the live site.
- Limitations: if the model still needs more than 90 seconds, the plan should be generated in smaller pieces (for
  example one day at a time) instead.

## 2026-10-11T06:29:46+05:30 — Fix Learn Linux's AI syllabus on GPT-5 models

- Changed: the learning API no longer sends `temperature: 0.3` to GPT-5 and o-series models, which accept only the
  default and answered HTTP 400 (`apps/api/src/learning.ts`). Learn Linux keeps its chosen `gpt-5.6-luna` model.
- Why: In production every Learn Linux syllabus request failed with "Unsupported value: 'temperature' does not
  support 0.3 with this model" (found through the new server-side error log), so Learn Linux had no AI course.
- Validation: `npm run typecheck` passed; 24 test files and 274 tests passed, including a new test that checks the
  request body for both kinds of model.
- Limitations: none known; confirm on the live site after deploy.

## 2026-10-11T06:24:10+05:30 — Production fixes: login no longer waits for the AI syllabus

- Changed:
  - Logging in no longer waits for the AI to plan the Learn Linux and Learn Docker syllabuses (about 30 seconds
    each in production, and forever if a request hung). Planning now runs in the background; the course shows
    that the trainer is generating the first lab until it is ready (`packages/lessons/src/ai.ts`).
  - Browser learning requests time out after 75 seconds with a readable error (`packages/system/src/index.ts`).
  - The API logs why an AI learning request failed (status, model and message) to the server log, because
    Cloudflare replaces 502 response bodies with its own page (`apps/api/src/learning.ts`).
- Why: On tuxos.akashanil.dev, login hung on the spinner: boot awaited two live syllabus requests. Learn Docker's
  took 28 seconds; Learn Linux's failed within a second with HTTP 502 (its default model, `gpt-5.6-luna`, is
  rejected by the configured key; cause still being confirmed).
- Validation: `npm run typecheck` passed; 24 test files and 273 tests passed, including a new test that boots
  while the syllabus request is still pending and sees the course appear once it finishes. Production
  diagnosis done with curl against the live site.
- Limitations: Learn Linux has no AI syllabus in production until its model problem is fixed.

## 2026-10-11T06:17:37+05:30 — Match Learn Docker colors to KDE Plasma

- Changed: Recolored the Learn Docker workspace surfaces, text, borders, and status accents to KDE Breeze Dark when shown in Plasma. The Docker workspace layout and content are unchanged.
- Why: Keep the Learn Docker window visually consistent with the selected KDE desktop theme.
- Files: `packages/course-view/src/course.css` and this changelog.
- Validation: `git diff --check` passed. No tests were run for this CSS-only change.
- Limitations: The recolor applies only under KDE Plasma; other desktop environments retain the existing Docker palette. No browser visual review was run.

## 2026-10-11T05:39:20+05:30 — CI/CD and production deployment setup

- Changed:
  - GitHub Actions workflow (`.github/workflows/ci-cd.yml`): type check, tests and web build on Node 24 for
    every push and pull request; on `main`, the release is uploaded over SSH and installed on the server, then
    the live site is checked.
  - `deploy/`: Caddy site block for tuxos.akashanil.dev, hardened systemd unit for the API, one-time
    `setup-server.sh` (Node 24, `tuxos` and `tuxos-deploy` users, `/opt/tuxos`, `/etc/tuxos/tuxos.env`, sudo
    rule limited to restarting the API) and `deploy.sh` (release folders, atomic symlink switch, health check,
    automatic rollback, keeps five releases).
  - API: `SOCKET` makes it listen on a Unix socket (production: `/run/tuxos/api.sock`, shared with the Caddy
    container, so no network port is opened); `HOST` sets a TCP listen address; with `TRUST_PROXY=1` the rate
    limit uses Cloudflare's `CF-Connecting-IP`, so visitors behind the proxy no longer share one limit.
  - Caddy on the server runs in Docker, so the site block proxies to the socket and the container needs
    `/opt/tuxos` and `/run/tuxos` mounted read-only; `/run/tuxos` is created at boot by tmpfiles.d.
- Why: The team wants automatic, safe deploys to their Oracle server on every push to `main`.
- Validation: workflow YAML parsed. `deploy.sh` run locally against a scratch root: two releases deployed,
  then a deliberately broken release failed its health check and was rolled back. Per-visitor rate limiting
  checked with curl (same IP limited, other IP not). Socket mode checked with curl (health answered, stale socket
  replaced, socket mode 666). On the server, `setup-server.sh` ran on Ubuntu 24.04 aarch64 (Node 24.21 installed,
  users, folders, sudo rule and service created). On Node 24.21: type check passed, 24 test files and 270
  tests passed, the API started and answered `/api/health`.
- Limitations: not yet run on the real server or in GitHub Actions. The Caddy block was not validated with
  `caddy validate` locally (no Caddy here); validate it on the server before reloading.

## 2026-10-11T05:29:29+05:30 — Keep cached Linux history out of syllabus planning

- Changed: Stopped attaching the full module memory cache to new syllabus requests. Hints and answers now receive only the last three short memory entries for the active task; Linux assessments continue to receive no prior-attempt history.
- Why: The browser showed a pending plan request with about 24 KB of request data even though the API health check passed. Old terminal attempts and verbose answers were irrelevant to generating a fresh syllabus and inflated the request.
- Files: `packages/lessons/src/ai.ts`, `apps/api/src/learning.ts`, `apps/api/src/learning.test.ts`, `modules/learn-linux/src/course.test.ts`, `README.md`, and this changelog.
- Validation: `npm run check` passed (23 test files, 259 tests); `npm run build` and `git diff --check` passed. Local `/api/health` returned `{"ok":true,"tutor":"configured"}`.
- Limitations: The health endpoint confirms configuration only, not upstream model availability; no live syllabus call was made.

## 2026-10-11T05:24:23+05:30 — Make Linux missions one command at a time

- Changed: Linux syllabus generation now makes each mission (including recaps) a single-command-line objective. Chained-command answers are rejected by both API and client validation (a pipeline remains valid for a pipe-specific lesson); assessment evaluates only the current command and output, and the runner advances after a correct result. Linux assessment requests no longer send prior-attempt memory. New one-command syllabi use a separate local state file, preserving previous cached plans.
- Why: The recap bundled `whoami` and `cd` into one confusing question, and previous attempts made each submission feel like another incomplete step in the same long prompt.
- Files: `apps/api/src/learning.ts`, `apps/api/src/learning.test.ts`, `packages/lessons/src/ai.ts`, `modules/learn-linux/src/course.test.ts`, `README.md`, and this changelog.
- Validation: `npm run check` passed (23 test files, 257 tests); `npm run build` and `git diff --check` passed.
- Limitations: Existing cached Linux plans are intentionally left untouched; the next launch generates a new syllabus in the versioned local state file. The API must be restarted to load the updated planning/evaluation rules.

## 2026-10-11T05:20:49+05:30 — Clarify the Linux learning mission header

- Changed: Styled the Linux scenario and task as a compact mission header with a left-side penguin, purple Bitcount Grid Double Ink display text, and an explicit recap/new badge. Linux answers now render as a command plus brief reason, capped at 140 characters in the API and local runner; assessments are capped at 110 characters and cumulative per-task command evidence is remembered. New syllabus tasks are constrained to one terminal submission, and duplicate task titles were removed.
- Why: The task needs a clear visual hierarchy, and long model output plus repeated whole-task feedback was obscuring what the learner should do next.
- Files: `apps/web/index.html`, `packages/course-view/src/index.tsx`, `packages/course-view/src/course.css`, `apps/api/src/learning.ts`, `apps/api/src/learning.test.ts`, `packages/lessons/src/ai.ts`, `modules/learn-linux/src/course.test.ts`, `README.md`, and this changelog.
- Validation: `npm run check` passed (23 test files, 256 tests); `npm run build` and `git diff --check` passed.
- Limitations: The API server must be restarted before existing sessions use the new answer limit.

## 2026-10-11T05:13:38+05:30 — Keep Linux terminal coaching module-scoped

- Changed: Learning terminals now carry their owning module ID, so `/hint`, `/answer`, and command assessments resolve against that module's trainer rather than a process-wide current trainer. The Linux task header now shows the scenario, task, and explicit `RECAP`/`NEW` status without the extra branding line.
- Why: A shared global trainer pointer allowed Learn Linux to display its own scenario while `/answer` returned Docker's task solution.
- Files: `packages/lessons/src/ai.ts`, `packages/lessons/src/runner.ts`, `packages/system/src/index.ts`, `modules/terminal/src/index.ts`, `modules/terminal/src/view.tsx`, `packages/course-view/src/index.tsx`, `modules/chmod-arcade/src/view.tsx`, `modules/learn-linux/src/course.test.ts`, and this changelog.
- Validation: `npm run check` passed (23 test files, 255 tests); `npm run build` and `git diff --check` passed. Added a cross-module Linux/Docker slash-command regression.
- Limitations: Existing open terminal windows should be closed and reopened so they receive their module-scoped context.

## 2026-10-11T05:06:11+05:30 — Keep Linux assessment feedback compact

- Changed: Routed Linux learning to `gpt-5.6-luna` by default with `OPENAI_MODEL_LINUX` override; constrained Linux assessments to one short verdict/context sentence and capped returned feedback at 110 characters. `/answer` remains a detailed teaching explanation.
- Why: Make the Linux trainer's model choice cost-conscious and keep correct/wrong feedback readable in the terminal.
- Files: `apps/api/src/server.ts`, `apps/api/src/learning.ts`, `apps/api/src/learning.test.ts`, `.env.example`, `README.md`, and this changelog.
- Validation: `npm run check` passed (23 test files, 254 tests); `npm run build` passed; `git diff --check` passed.
- Limitations: Existing local `.env` model overrides are not modified automatically; restart the API after updating configuration.

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

## 2026-10-11T04:55:20+05:30 — Align AI syllabus recap schema and surface planning failures

- Changed: Made the planner prompt specify a task-level recap marker for the first task on every day after day one; API and client validation now enforce exactly that contract. Linux status refreshes while initial generation is pending so a completed failure does not remain displayed as “generating.” Added API regression coverage and updated the syllabus behavior in the README.
- Why: The observed `/api/learning/plan` response rejected generated plans because the recap requirement was underspecified at the task level; the terminal also kept a stale pending status.
- Files: `apps/api/src/learning.ts`, `apps/api/src/learning.test.ts`, `packages/lessons/src/ai.ts`, `packages/course-view/src/index.tsx`, `modules/learn-linux/src/course.test.ts`, `packages/tutor/src/tutor.test.ts`, `README.md`, and this changelog.
- Validation: `npm run check` passed (23 test files, 254 tests); `npm run build` passed; focused tutor-panel rerun passed (5 tests). One initial full-suite run had a timing-sensitive tutor-panel failure; the subsequent full suite passed.
- Limitations: The live API process must be restarted to load backend prompt/validation changes; a live model response has not yet been verified.

## 2026-10-11T04:46:25+05:30 — Prevent duplicate Linux syllabus generation

- Changed: Made AI syllabus generation single-flight and added a visible busy state to the Linux retry button, preventing retries from starting duplicate model requests while generation is already running.
- Why: The screenshot showed the runner still in its pending-generation state; repeated retry clicks could create overlapping requests and leave confusing status.
- Files: `packages/lessons/src/ai.ts` and `packages/course-view/src/index.tsx`.
- Validation: `npm run check` passed with 23 test files and 252 tests; `npm run build` passed; `git diff --check` passed.

## 2026-10-11T04:44:47+05:30 — Diagnose and retry failed Linux AI planning

- Changed: Linux status now retains and displays the actual AI planning error. Added a Retry AI trainer action, and hardened the API to normalize model-generated course IDs and reject incomplete syllabus/task structures with specific diagnostics.
- Why: `/api/health` reports key presence only; it does not test model access or syllabus validity. A startup plan failure previously left a generic unavailable screen with no retry path.
- Files: `packages/lessons/src/ai.ts`, `packages/course-view/src/index.tsx`, `packages/course-view/src/course.css`, `apps/api/src/learning.ts`, and API tests.
- Validation: `npm run check` passed with 23 test files and 252 tests; `npm run build` passed; `git diff --check` passed.
- Limitation: The sandbox cannot connect to the user's localhost API, so a live OpenAI plan request could not be exercised here.

## 2026-10-11T04:41:44+05:30 — Start the AI API with the desktop dev server

- Changed: `npm run dev` now supervises both the local API and Vite development server, so AI-generated Linux tasks do not fail merely because the API was started in a separate terminal.
- Why: The strict Linux lab correctly refuses hardcoded questions, but the previous developer command did not start the required AI service.
- Files: `scripts/dev.mjs`, `package.json`, and `README.md`.
- Validation: The script is standard Node process orchestration; existing `npm run check`, build, and diff checks remain the relevant project validation.

## 2026-10-11T04:39:39+05:30 — Strict AI Linux terminal lab

- Changed: Replaced the Linux course dashboard with a real xterm terminal surface and shell-style `#` task comments. Linux now requires a successful AI-generated syllabus and assessment; it no longer loads the hardcoded JSON course as a learner fallback. Terminal startup was enabled so `/hint` and `/answer` are available in the embedded lab.
- Why: Make Linux practice feel like an actual terminal session and ensure every learner question and next task comes from the configured AI trainer.
- Files: `modules/terminal/src/view.tsx`, `packages/course-view/src/index.tsx`, `packages/course-view/src/course.css`, `packages/lessons/src/ai.ts`, `modules/learn-linux/src/index.ts`, and tests.
- Validation: `npm run check` passed with 23 test files and 252 tests; `npm run build` passed; `git diff --check` passed.
- Limitation: If the learning API is down or the key is unavailable, Linux shows an explicit AI-trainer-unavailable state rather than presenting a local question.

## 2026-10-11T04:30:13+05:30 — AI task wiring for chmod lab

- Changed: Connected chmod Arcade to the AI course runner with a reviewed fallback syllabus, module-specific security trainer persona, and generated task text in the terminal workspace while retaining the permission visualization and game.
- Why: Make chmod follow the same adaptive, scenario-based learning flow as Linux and Docker.
- Files: `modules/chmod-arcade/src/course.ts`, `modules/chmod-arcade/src/index.ts`, `modules/chmod-arcade/src/manifest.ts`, `modules/chmod-arcade/src/view.tsx`, and package metadata.
- Validation: `npm run check` passed with 23 test files and 257 tests; `npm run build` passed; `git diff --check` passed.

## 2026-10-11T04:29:13+05:30 — Terminal-first learning lab frontend

- Changed: Replaced Linux and Docker lesson windows with embedded terminal labs that keep the AI-generated task visible above the shell, execute learner commands on Enter, and expose `/hint` and `/answer` in the same terminal context. Added Docker daemon/images/containers visualization and extended chmod Arcade with a terminal task banner and embedded terminal beside its permission game.
- Why: Make the learning experience feel like real operational work instead of a lesson page that sends learners elsewhere to practice.
- Files: `packages/course-view/src/index.tsx`, `packages/course-view/src/course.css`, `modules/learn-linux/src/view.tsx`, `modules/learn-docker/src/view.tsx`, `modules/learn-docker/src/index.ts`, `modules/chmod-arcade/src/view.tsx`, and `modules/chmod-arcade/src/arcade.css`.
- Validation: `npm run check` passed with 23 test files and 257 tests; `npm run build` passed; `git diff --check` passed.
- Limitation: The Docker visualization is intentionally a concise engine summary; detailed diagnostics remain in the terminal output.

## 2026-10-11T04:14:36+05:30 — Module-local learning memory and model routing

- What changed: Added bounded local memory files per learning module, memory-aware planning/hints/answers/evaluation, and independent environment-configurable model routing for Linux, Docker, Terminal, and chmod-arcade.
- Why: Keep learner continuity distinct between trainer personas and make module model choice explicit without putting secrets or learner history in the browser/API state.
- Affected files: `packages/lessons/src/ai.ts`, `apps/api/src/learning.ts`, `apps/api/src/server.ts`, `apps/api/src/tutor.ts`, `.env.example`, `README.md`, and learning tests.
- Validation: `npm run check` passed with 22 test files and 251 tests; `npm run build` passed; `git diff --check` passed.
- Known limitation: OpenAI-compatible generation is remote unless `OPENAI_BASE_URL` points to a local inference server; persisted state and memory are always local to the virtual filesystem.

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

## 2026-10-11T04:10:23+05:30 — AI-designed terminal learning backend

- Changed:
  - Added server-side `/api/learning/plan`, `/evaluate`, `/hint`, and `/answer` endpoints with structured response validation and per-module trainer personas.
  - Added AI course runners for Learn Linux and Learn Docker. They generate seven-day, industry-scenario syllabi, require recap tasks after day one, evaluate actual terminal evidence, and persist progress.
  - Added terminal-native `/hint`, `/answer`, `/task`, and `/next` commands without changing frontend components; AI-mode command results include an explicit trainer assessment.
  - Preserved the existing reviewed JSON courses as a deterministic fallback when the AI service is unavailable.
- Why: Make learning content adaptive and realistic while keeping execution local, auditable, and safe.
- Validation: `npm run check` passed with 22 test files and 250 tests; `npm run build` passed; `npm install --package-lock-only --ignore-scripts` completed.
- Limitations: AI content quality depends on the configured model; the fallback is intentionally deterministic; real API/browser validation requires a valid server-side key and running local servers.

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
