# Contributing

We welcome contributions! Please follow these guidelines to keep the codebase secure and stable.

## Workflow

1.  **Fork & Clone**: Fork the repo and clone it locally.
2.  **Branching**: proper branching strategy is encouraged.
    - `main`: Production-ready code. Protected branch.
    - `develop`: Integration branch for everyday work.
    - Feature branches: `feat/my-feature`, `fix/bug-id`.
3.  **Development**:
    - Install: `npm install`
    - Test: `npm test`
    - Lint: `npm run lint`
4.  **Pull Requests**:
    - Open a PR against `main` (or `develop` if dealing with unstable features).
    - CI checks must pass (lint, build, tests).
    - Code review is required before merging.

## Branch Protection (Rulesets)

We recommend using **Rulesets** (the modern way) to protect `main`.

1.  Go to **Settings** > **Rules** > **Rulesets**.
2.  Click **New ruleset** > **New branch ruleset**.
3.  **General**:
    - Name: `Protect Main`
    - Enforcement status: **Active**
4.  **Target branches**:
    - Click **Add target** > **Include default branch** (`main`).
5.  **Rules** (check these):
    - [x] **Restrict deletions**
    - [x] **Require a pull request**
      - Required approvals: `1`
    - [x] **Require status checks to pass**
      - Click **Add checks** and search for `lint-test` (must have run once in CI to appear).
6.  Click **Create**.

## Release Process

1.  Create a **GitHub Release** aimed at `main`.
2.  Tag with semantic versioning (e.g., `v0.6.1`).
3.  The **Publish** workflow will automatically test and publish to npm.
