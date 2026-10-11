# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** TuxOS
- **Short description:** Linux feels intimidating to newcomers, and practising on a real machine risks breaking
  it. TuxOS is a pretend Linux computer in the browser (GRUB, login screens, and the KDE Plasma, GNOME, CDE and
  Hyprland desktops) with a real-feeling terminal and file system. AI trainers teach Linux, Docker and file
  permissions lesson by lesson, teaching first and then checking what the learner types, and Vasi, a penguin
  teacher, explains, demonstrates on the computer himself, then hands the keyboard back. Accounts keep progress
  across devices. It is for students and anyone starting with Linux.
- **Code repository URL:** https://github.com/akashanil-dev/ayalvasis
- **Final submitted implementation commit SHA:** `0b479a373a04de630de31a12178cea74bcdf2273` (later commits, if any, change documentation only)
- **Working demo URL or local demo steps:** https://tuxos.akashanil.dev, or locally: `npm install`, then `npm run dev` and open the URL Vite prints.
- **Demo access requirements:** none. Choose "Try without an account" on the login screen, or create an account with any username and password. A laptop or desktop browser works best.

## Participants

Participate solo or in a team of up to 4. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| TODO | TODO | TODO |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 22.18 or newer (CI and production use Node 24) and npm.
- **Install command:** `npm install`
- **Required environment variable names:** `OPENAI_API_KEY` for the AI tutor and trainers (optional: without it the desktop, terminal, Files, Editor and Learn Docker's reviewed lessons still work). Optional settings are documented in [`.env.example`](.env.example).
- **Start command:** `npm run dev` (starts the API on port 8787 and the Vite dev server).
- **Demo walkthrough:**
  1. Wait for GRUB to boot, then create an account (or try without one) on the KDE login screen.
  2. Meet Vasi: he introduces himself in a speech bubble. Ask him what he can do.
  3. Open Learn Linux: read the "Learn first" lesson, press "I'm ready — let me try", type a command in the lab
     terminal and see the trainer's verdict.
  4. Ask Vasi "show me how to list hidden files": he types it in his own terminal, then hands it back. Ask him to
     show `/etc/shadow` and he will ask for sudo with your password.
  5. Switch desktops from Settings (KDE, GNOME, CDE, Hyprland) and see the apps restyle; try Learn Docker and
     chmod Arcade.
  6. Log out and sign in again from another browser: your files and progress are still there.
- **Checks performed and results:** `npm run check` (TypeScript type check and Vitest): 26 test files, 291 tests passed. Every push runs the same checks plus a production build and an API start-up check in GitHub Actions, then deploys; the live site's health check passes.
- **Known limitations or incomplete features:** see "Known limitations" in the [README](README.md#current-status): among them, no password reset, a simplified shell and Docker, and Vasi's real-model answer quality not yet systematically reviewed.
- **Libraries, APIs, and public datasets used:** listed with licences in the [README](README.md#current-status) (React, Vite, xterm.js, Vitest, the OpenAI API, Inter and JetBrains Mono fonts, and GNOME, Breeze and Papirus icons; see [`apps/web/public/icons/CREDITS.md`](apps/web/public/icons/CREDITS.md)). No public datasets.
- **AI usage record:** [AI_USAGE.md](AI_USAGE.md)
- **Development change log:** [CHANGELOG.md](CHANGELOG.md)

## Submission checklist

- [ ] The project implementation started from scratch at the event.
- [ ] I participated solo or with no more than 4 team members in total.
- [ ] Codex was used during development and its usage is documented.
- [ ] The code repository URL, short description, and working demo are provided.
- [ ] README setup and demo instructions match the submitted code.
- [ ] Actual checks and known limitations are documented.
- [ ] Meaningful changes are documented and committed throughout development.
- [ ] The final implementation is committed and pushed, and its SHA is recorded above.
- [ ] No credentials or private data are included in the repository or demo instructions.
- [ ] The organizers' announced submission method and timing have been followed.

Event reference: [DevDay Exchange Community: Kochi on Luma](https://luma.com/z10nz8gp). The event wraps up by **10:00 AM IST on 11 October 2026**.
