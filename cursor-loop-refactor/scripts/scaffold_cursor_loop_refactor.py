#!/usr/bin/env python3
"""Create Cursor loop-refactor scaffold files in an existing project."""

from __future__ import annotations

import argparse
from pathlib import Path

CURSOR_RULE = """---
description: loop engineering rules for reverse engineering, refactoring, testing, and deploy readiness
alwaysApply: true
---

# Loop Engineering Rules

Always use this loop before claiming completion:

1. Goal
2. Context
3. Discover
4. Plan
5. Execute
6. Verify
7. Iterate
8. Actions
9. Stop Condition
10. Verified Output

## Required behavior

- Discover relevant files, commands, tests, configs, routes, schemas, and dependencies before editing.
- Prefer reverse-engineered specs in `docs/specs/` and executable tasks in `tasks/`.
- Create missing specs when they do not exist.
- Create missing tests when they do not exist.
- Add characterization tests before refactoring uncertain legacy behavior.
- Keep changes small and verifiable.
- Do not say the work is complete only because files changed.

## Testing requirements

- Use unit tests for isolated logic.
- Use integration tests for real boundaries: database, API, filesystem, queue, service wiring, auth, or external adapters.
- Use Playwright for all e2e web user journeys.
- The final Playwright readiness test must run against the real application as a user would, without mocks.
- Mocks are allowed for narrow unit tests only, not for final integration/e2e readiness.

## Completion rule

Only mark the task complete after providing Verified Output:

- Commands executed
- Results
- Evidence such as logs, screenshots, traces, videos, or reports when relevant
- Remaining risks or unknowns
"""

SPEC_TEMPLATE = """# {title} Spec

## Goal

## Context
- Project area:
- Entry points:
- Important files:
- Runtime dependencies:
- Environment variables:
- Database/storage dependencies:

## Observed Behavior

## Inferred Intent

## Unknowns

## Risks

## Discover

## Plan

## Execute

## Verify
### Static checks

### Unit tests

### Integration tests

### Playwright e2e

## Iterate

## Actions
- [ ] Discover current behavior
- [ ] Update implementation
- [ ] Add missing tests
- [ ] Run verification
- [ ] Report verified output

## Stop Condition

## Verified Output
"""

TASK_TEMPLATE = """# Cursor Task: {title}

You are working inside Cursor. Follow the loop strictly.

## Goal

## Context
Read the matching spec first: `docs/specs/{slug}.spec.md`.

## Discover
Before editing, inspect the relevant files, tests, configs, routes, schemas, services, pages, jobs, and runtime dependencies.

## Plan
Create a short plan with small verifiable steps.

## Execute
Implement the smallest safe change. Create missing tests. Keep behavior stable unless the spec explicitly requires a behavior change.

## Verify
Run static checks, unit tests, integration tests, Playwright e2e, and a final no-mock readiness journey.

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
"""


def write_if_missing(path: Path, content: str, overwrite: bool) -> str:
    if path.exists() and not overwrite:
        return f"kept existing {path}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return f"wrote {path}"


def title_from_slug(slug: str) -> str:
    return slug.replace("-", " ").replace("_", " ").title()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Cursor loop-refactor scaffold files.")
    parser.add_argument("project_path", help="Path to the project root")
    parser.add_argument("--slug", default="reverse-engineered-area", help="Feature or area slug")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing scaffold files")
    args = parser.parse_args()

    root = Path(args.project_path).resolve()
    if not root.exists():
        raise SystemExit(f"Project path does not exist: {root}")
    if not root.is_dir():
        raise SystemExit(f"Project path is not a directory: {root}")

    slug = args.slug.strip().lower().replace(" ", "-")
    title = title_from_slug(slug)

    outputs = [
        write_if_missing(root / ".cursor" / "rules" / "loop-engineering.mdc", CURSOR_RULE, args.overwrite),
        write_if_missing(root / "docs" / "specs" / f"{slug}.spec.md", SPEC_TEMPLATE.format(title=title), args.overwrite),
        write_if_missing(root / "tasks" / f"{slug}.cursor-task.md", TASK_TEMPLATE.format(title=title, slug=slug), args.overwrite),
    ]

    tests_dir = root / "tests"
    tests_dir.mkdir(exist_ok=True)
    outputs.append(f"ensured {tests_dir}")

    print("\n".join(outputs))


if __name__ == "__main__":
    main()
