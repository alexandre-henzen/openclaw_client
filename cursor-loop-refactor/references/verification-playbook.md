# Verification Playbook

## Verification ladder

1. Static: format, lint, typecheck, compile.
2. Unit: isolated business logic with narrow mocks allowed.
3. Integration: real boundaries and wiring. Prefer real database/container/service over mocks.
4. E2E: Playwright browser test for user-visible behavior.
5. Readiness: start the real app and run a no-mock Playwright journey as a user.

## Integration tests

Integration tests should prove components work together across real boundaries:

- API route to service to database
- frontend to backend contract where practical
- job/worker to queue/database/filesystem
- authentication/authorization path with a real or local test identity provider when feasible
- migrations against a real disposable database

Use mocks only when the real dependency is impossible or unsafe, and clearly state the limitation.

## Playwright e2e requirements

Every web project needs Playwright for e2e readiness.

A real Playwright readiness test must:

- Start or target the real application.
- Interact through the browser like a user.
- Avoid mocked network routes for final readiness.
- Use seeded or disposable test data.
- Assert visible outcomes and persisted side effects where applicable.
- Save traces/screenshots/videos on failure when configured.

## Evidence format

Verified Output should include:

```markdown
## Verified Output
- Static checks: <command> -> <result>
- Unit tests: <command> -> <result>
- Integration tests: <command> -> <result>
- Playwright e2e: <command> -> <result>
- Readiness journey: <scenario> -> <result>
- Evidence: <logs/screenshots/traces/reports>
- Remaining risks: <none or list>
```

## When commands cannot run

If the environment cannot run a command, do not imply success. Report:

- Command not run
- Reason
- Exact command for the user/Cursor to run
- Expected passing evidence
