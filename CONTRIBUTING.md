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

## Branch Protection (Recommended)

To ensure quality, we recommend enabling these **Branch protection rules** in GitHub Settings:

- **Require a pull request before merging**
  - _Require approvals_: 1
- **Require status checks to pass before merging**
  - _Status check_: `lint-test` (from `.github/workflows/ci.yml`)
- **Require signed commits** (optional but good)
- **Do not allow bypassing the above settings**

## Release Process

1.  Create a **GitHub Release** aimed at `main`.
2.  Tag with semantic versioning (e.g., `v0.6.1`).
3.  The **Publish** workflow will automatically test and publish to npm.
