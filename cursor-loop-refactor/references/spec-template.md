# Reverse-Engineered Spec Template

Use this template for `docs/specs/<feature-or-area>.spec.md`.

```markdown
# <Feature or Area> Spec

## Goal
Describe the intended outcome in one or two sentences.

## Context
- Project area:
- Entry points:
- Important files:
- Runtime dependencies:
- Environment variables:
- Database/storage dependencies:

## Observed Behavior
Facts proven from source code, tests, routes, schemas, UI, logs, or configuration.

## Inferred Intent
Likely intent. Mark each item as inference, not fact.

## Unknowns
Questions that cannot be answered from the available code.

## Risks
- Untested behavior:
- Hidden coupling:
- Deployment/runtime risk:
- Data migration risk:
- Security/auth risk:

## Discover
What Cursor must inspect before editing.

## Plan
Small behavior-preserving steps first, followed by intended improvements.

## Execute
Implementation instructions and files likely to change.

## Verify
### Static checks
- <format/lint/typecheck command>

### Unit tests
- <unit test command>

### Integration tests
- <integration test command using real dependencies where practical>

### Playwright e2e
- <command to start app>
- <command to run Playwright>
- Required real user journey:

## Iterate
How to respond to failures.

## Actions
Cursor-ready action list.

## Stop Condition
Objective conditions that must all be true.

## Verified Output
Evidence Cursor must provide: commands run, result summary, screenshots/traces/logs when relevant.
```
