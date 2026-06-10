# Cursor Task Template

Use this template for `tasks/<feature-or-area>.cursor-task.md`.

```markdown
# Cursor Task: <Feature or Area>

You are working inside Cursor. Follow the loop strictly.

## Goal
<Concrete goal>

## Context
Read the matching spec first: `docs/specs/<feature-or-area>.spec.md`.
Relevant files likely include:
- <path>

## Discover
Before editing, inspect:
- Project structure and package manager files
- Existing tests and test commands
- Relevant source files, routes, schemas, services, pages, jobs, and configs
- Runtime dependencies required for integration and e2e tests

Summarize what you found before making changes.

## Plan
Create a short plan with small verifiable steps. Prefer characterization tests before refactoring uncertain legacy behavior.

## Execute
Implement the smallest safe change. Create missing tests. Keep behavior stable unless the spec explicitly requires a behavior change.

## Verify
Run the strongest available checks:
1. Format/lint/typecheck
2. Unit tests
3. Integration tests with real dependencies where practical
4. Playwright e2e with the app running
5. Final no-mock readiness journey using Playwright as a real user

Do not claim completion without command output or equivalent evidence.

## Iterate
If anything fails, fix the smallest cause and rerun the failed check, then rerun readiness checks.

## Actions
- [ ] Discover and summarize current behavior
- [ ] Update or create spec
- [ ] Add missing characterization/unit tests
- [ ] Add or update integration tests
- [ ] Add or update Playwright e2e tests
- [ ] Refactor implementation
- [ ] Run verification
- [ ] Report verified output

## Stop Condition
Stop only when all required checks pass and the real Playwright user journey succeeds without mocks.

## Verified Output
Report:
- Commands run
- Pass/fail result
- Evidence paths: screenshots, videos, traces, logs, reports
- Any remaining risks or unknowns
```
