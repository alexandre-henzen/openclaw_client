---
name: cursor-loop-refactor
description: reverse-engineer existing software projects and refactor them using a cursor-oriented loop engineering workflow. use when the user asks to analyze existing code, recreate missing specifications, generate cursor task prompts, create or improve tests, enforce real integration/e2e verification, or organize work into goal, context, discover, plan, execute, verify, iterate, actions, stop condition, and verified output. especially relevant for cursor projects that need specs, .cursor/rules, test strategy, playwright e2e tests without mocks, and deploy-readiness validation.
---

# Cursor Loop Refactor

## Core Behavior

Use this skill to turn an existing codebase into a verified, specification-driven project for Cursor.

Always produce work in the loop engineering structure:

1. `Goal`
2. `Context`
3. `Discover`
4. `Plan`
5. `Execute`
6. `Verify`
7. `Iterate`
8. `Actions`
9. `Stop Condition`
10. `Verified Output`

The user wants reverse engineering plus refactoring. Do not treat documentation as the final deliverable. The expected result is a codebase with recreated specs, permanent Cursor rules, tests where missing, and real verification evidence.

## Required Project Organization

Default to this structure unless the user explicitly requests another one:

```text
docs/specs/
tasks/
.cursor/rules/
tests/
```

Use:

- `docs/specs/<feature-or-area>.spec.md` for reverse-engineered specifications.
- `tasks/<feature-or-area>.cursor-task.md` for Cursor execution prompts.
- `.cursor/rules/loop-engineering.mdc` for permanent Cursor behavior.
- `tests/` or the framework-native test directories for unit, integration, and e2e tests.

When the user asks to create the scaffolding files, use `scripts/scaffold_cursor_loop_refactor.py` if filesystem access is available.

## Non-Negotiable Verification Rules

Never mark a task as complete only because code was changed.

A task is complete only when there is `Verified Output`, such as passing tests, a successful build, a running endpoint, a real browser flow, logs, screenshots, traces, or other objective evidence.

For web applications:

- Always require Playwright for e2e.
- Always include at least one real user journey with Playwright.
- Do not use mocks for the final Playwright readiness test.
- Final readiness verification must exercise the running application as a user would.
- Prefer seeded test data, disposable environments, local containers, or staging services over mocked dependencies.

Mocks are acceptable only for narrow unit tests. They are not acceptable for final integration or e2e readiness claims.

## Workflow

### 1. Discover

Before proposing changes, inspect the project structure and identify:

- Languages, frameworks, package managers, build tools, and test frameworks.
- Entry points, routes, services, jobs, CLI commands, database migrations, and configuration files.
- Existing tests, missing tests, skipped tests, brittle tests, and unverified critical paths.
- External dependencies such as databases, queues, object storage, authentication, APIs, and environment variables.
- Business flows that can be inferred from code, routes, UI, API contracts, schemas, and tests.

Use `references/stack-detection.md` when choosing test and verification options.

### 2. Recreate specifications

For every relevant feature, module, service, endpoint, page, job, or integration, create a spec using `references/spec-template.md`.

A reverse-engineered spec must distinguish:

- `Observed behavior`: what the current code appears to do.
- `Inferred intent`: what the system likely intends to do.
- `Unknowns`: facts that cannot be proven from code.
- `Risks`: behavior that may be accidental, under-tested, or unsafe.
- `Verification`: commands and real user flows that prove the behavior.

Do not invent business rules as facts. Mark them as inferred or unknown.

### 3. Plan the refactor

Break work into small, verifiable steps. Each step must have:

- Files likely to change.
- Expected behavior change.
- Tests to add or update.
- Verification commands.
- Rollback or iteration strategy if verification fails.

Generate a Cursor task prompt in `tasks/<feature-or-area>.cursor-task.md` using `references/cursor-task-template.md`.

### 4. Execute safely

When implementing or instructing Cursor to implement:

- Prefer behavior-preserving refactors before behavior changes.
- Keep public contracts stable unless the spec explicitly requires a change.
- Add characterization tests before refactoring uncertain legacy behavior.
- Add missing unit and integration tests before or during the refactor.
- Add Playwright e2e flows for user-visible behavior.
- Avoid broad rewrites unless the spec proves they are necessary.

### 5. Verify

Use the stack-specific verification guidance in `references/verification-playbook.md`.

At minimum, require:

- Static checks where available: format, lint, typecheck.
- Unit tests for isolated logic.
- Integration tests for real boundaries such as database, API, filesystem, queue, or service wiring.
- Playwright e2e tests for real user journeys in web apps.
- A final no-mock readiness run that starts the real application and executes the relevant Playwright flow.

If verification cannot be run in the current environment, clearly state what was not run and generate exact commands for the user or Cursor to run.

### 6. Iterate

If a check fails:

1. Capture the failing command and error summary.
2. Identify whether the failure is in implementation, test setup, environment, or the reverse-engineered spec.
3. Fix the smallest cause.
4. Re-run the failed check and then the broader readiness checks.
5. Update the spec if discovery proves the previous assumption wrong.

## Cursor Permanent Rule Requirements

When asked to set up Cursor behavior, create `.cursor/rules/loop-engineering.mdc` from `references/cursor-rule-template.mdc`.

The rule must tell Cursor to:

- Discover before editing.
- Work from specs and Cursor tasks.
- Create missing tests.
- Use Playwright for e2e.
- Run real no-mock integration/e2e checks before claiming deploy readiness.
- Report `Verified Output` with commands and evidence.

## Output Contract

Every answer that plans or executes work must include these sections:

```markdown
# Goal
# Context
# Discover
# Plan
# Execute
# Verify
# Iterate
# Actions
# Stop Condition
# Verified Output
```

For small advisory answers, a condensed version is acceptable, but `Goal`, `Plan`, `Verify`, `Stop Condition`, and `Verified Output` must remain.

Use `references/output-contract.md` for formatting details.
