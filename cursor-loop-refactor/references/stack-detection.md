# Stack Detection and Test Options

Detect the stack from package files, project files, lockfiles, source extensions, framework configs, and existing test directories.

## JavaScript / TypeScript / Node

Signals: `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `tsconfig.json`, `vite.config.*`, `next.config.*`, `angular.json`, `nest-cli.json`.

Common choices:
- Unit: Vitest or Jest
- Integration: framework test runner plus real database/container when possible
- E2E: Playwright
- Checks: `npm|pnpm|yarn lint`, `typecheck`, `test`, `build`

Prefer the package manager already used by the lockfile.

## Angular

Signals: `angular.json`, `src/app`, Angular dependencies.

Common choices:
- Unit: existing Angular test setup, Jest, or Karma only if already present
- Integration: component/service tests plus real backend where practical
- E2E: Playwright
- Checks: lint, test, build

## React / Next / Vite

Signals: `vite.config.*`, `next.config.*`, `src/pages`, `app/`, React dependencies.

Common choices:
- Unit: Vitest or Jest
- Integration: Testing Library plus real API/database where practical
- E2E: Playwright

## Python

Signals: `pyproject.toml`, `requirements.txt`, `poetry.lock`, `uv.lock`, `Pipfile`, `.py` files.

Common choices:
- Unit: pytest
- Integration: pytest with real database/container, FastAPI TestClient for API boundaries, or live server tests when needed
- E2E: Playwright for web UI
- Checks: ruff, mypy/pyright, pytest

## .NET / C#

Signals: `.sln`, `.csproj`, `Directory.Build.props`, `global.json`.

Common choices:
- Unit: xUnit, NUnit, or MSTest based on existing project
- Integration: WebApplicationFactory/Testcontainers/real SQL Server or PostgreSQL where practical
- E2E: Playwright for web UI
- Checks: `dotnet build`, `dotnet test`

## Go

Signals: `go.mod`, `.go` files.

Common choices:
- Unit: `go test ./...`
- Integration: `go test` with build tags or Testcontainers where practical
- E2E: Playwright for web UI
- Checks: `go test ./...`, `go vet ./...`, lint if configured

## Java / Kotlin

Signals: `pom.xml`, `build.gradle`, `settings.gradle`, `.java`, `.kt`.

Common choices:
- Unit: JUnit
- Integration: Spring Boot tests/Testcontainers where practical
- E2E: Playwright for web UI
- Checks: Maven or Gradle build/test commands

## Selection rule

If a test framework already exists, prefer extending it. If none exists, propose 2-3 options and recommend one based on the stack, maintenance cost, and ecosystem fit. Always use Playwright for e2e.
