# Learn Docker: product and implementation plan

## Product goal

Make Learn Docker feel like a small Docker Desktop workspace while keeping the learning loop obvious: read one
realistic mission, make one concrete change or run one command, inspect the result, then get concise feedback.
The Docker trainer owns a separate AI syllabus and local learning memory. It must not reuse Linux lessons or
present the old reviewed Docker JSON course as generated content.

## Current delivery

1. **Docker Desktop-style shell** — Docker-blue app bar, workspace navigation, an AI learning path, one mission
   card, engine status and resource counts, plus views for containers, images, builds and Compose. The terminal
   stays in one place as learners switch views. The UI is Docker-inspired, not a pixel-for-pixel copy of Docker's
   proprietary product.
2. **AI course lifecycle** — server-selected Docker model and trainer persona produce a seven-day beginner-to-
   advanced syllabus. The first task of every day after day one is a recap. The trainer prompt is scoped to
   industry tickets and operations that this lab can verify. The course is AI-only: if planning fails, the UI
   reports the failure and offers retry rather than substituting hard-coded questions. A versioned local progress
   path makes the new syllabus take effect without deleting older local files.
3. **Dockerfile exercise** — the editor writes `~/Dockerfile`; Build runs `docker build -t NAME .` against the
   learner's virtual home. The simulator checks a single-stage `FROM`, known base/tag, supported instructions,
   safe `RUN` commands and `COPY` build-context paths, then creates a persistent local image that can be run and
   inspected. `RUN` is intentionally validated, not executed.
4. **Compose exercise** — the editor writes `~/compose.yaml`; `docker compose up -d`, `ps`, and `down` operate on
   a project-scoped simulated service set. Supported service fields are `image`, `ports`, and `environment`, with
   `container_name` and `restart` accepted as metadata. Invalid or unsupported syntax fails explicitly; the
   parser is a constrained lab format, not a full YAML/Compose implementation.
5. **Persistence and isolation** — engine state remains in the virtual filesystem under root-only
   `/var/lib/docker`; authored files remain in the learner's virtual home. The simulator never launches a host
   process, contacts a registry, or connects to the user's Docker daemon.

## Architecture and verification contract

- `packages/course-view` owns the Docker Desktop-inspired view and the Dockerfile/Compose authoring controls.
- `modules/learn-docker` owns the CLI, artifact-write action, engine state, Dockerfile validation/build simulation,
  and Compose lifecycle. Commands run through the existing virtual shell and filesystem.
- `apps/api/src/learning.ts` constrains the Docker trainer to supported features and requires industry context,
  measurable objectives, progressive hints, and recap markers. `packages/lessons` owns module-local progress and
  memory.
- Verification should assert both failure and success: malformed/unsafe Dockerfiles, missing COPY sources,
  successful image creation and `docker run`, valid/invalid Compose, `up`/`ps`/`down`, old-state compatibility,
  and AI-unavailable behavior with no static question leakage.

## Next milestones

These are deliberately not claimed as implemented yet:

1. Add named volumes and bind-mount concepts to the virtual state, CLI, Compose parser, UI, persistence and tests.
2. Add health checks and service readiness as simulated state, with deterministic diagnostics and AI assessment
   evidence; do not claim a process is healthy based only on model output.
3. Expand build semantics in a sandboxed, deterministic interpreter: multi-stage targets, cache/layer inspection,
   richer COPY/ENV/ARG behavior, and registry/tag workflows that remain local unless an explicit registry mock is
   added. Do not evaluate arbitrary Dockerfile `RUN` on the host.
4. Add network/resource/security controls only alongside matching engine state, CLI behavior, UI evidence, and
   tests. Update the AI prompt after each capability is actually implemented.
5. Add visual end-to-end checks at desktop and narrow widths, and run a live model call to review syllabus quality
   when a test API key is available; automated checks currently verify the prompt contract, not model quality.

## Known limits

The current Docker engine is a deterministic educational model. It handles a useful workflow, not OCI image
construction or Linux namespaces. Dockerfile layer counts and build output are illustrative. In particular,
Dockerfile `RUN` instructions are allow-listed but not run, Compose does not support dependencies/builds/volumes,
and the Volumes screen is a placeholder. AI-created lesson quality depends on the configured backend/model.
