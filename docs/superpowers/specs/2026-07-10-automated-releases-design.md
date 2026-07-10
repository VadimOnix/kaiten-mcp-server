# Automated Releases + Docker Hub Publish — Design

**Date:** 2026-07-10
**Status:** Approved

## Goal

Fully automated releases driven by Conventional Commits: push to `main` →
version bump, CHANGELOG, git tag, GitHub Release, npm publish, and a
multi-arch Docker image pushed to public Docker Hub.

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Release tool | semantic-release (fully automatic on push to `main`) |
| Docker Hub image | `vadimkorolev/kaiten-mcp-server` |
| npm publish | Yes — package renamed `mcp-kaiten` → `kaiten-mcp-server` (old name taken on npm by upstream author) |

## Components

### 1. `.github/workflows/ci.yml`
- Trigger: `pull_request`.
- Steps: checkout → setup-node 22 (npm cache) → `npm ci` → `npm run build` → `npm test`.

### 2. `.github/workflows/release.yml`
- Trigger: `push` to `main`. Concurrency group `release` (no parallel releases).
- Permissions: `contents: write` (tags, release commit), `issues`/`pull-requests: write` (semantic-release comments), `id-token: write` (npm provenance).
- Job `release`: checkout `fetch-depth: 0` → setup-node → `npm ci` → build → test → `cycjimmy/semantic-release-action@v4` (uses local semantic-release install). Outputs `new_release_published` / `new_release_version`.
- Job `docker` (`needs: release`, runs only if a release was published): checkout the new tag → QEMU + Buildx → Docker Hub login (`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets) → `docker/build-push-action` for `linux/amd64,linux/arm64` with tags `latest`, `X.Y.Z`, `X.Y`, `X` (via `docker/metadata-action` semver patterns), GHA layer cache.

### 3. `.releaserc.json`
Branches: `main`. Plugins (order matters):
1. `@semantic-release/commit-analyzer` — `conventionalcommits` preset.
2. `@semantic-release/release-notes-generator` — same preset.
3. `@semantic-release/changelog` — prepends to `CHANGELOG.md`.
4. `@semantic-release/npm` — bumps `package.json`, publishes to npm.
5. `@semantic-release/github` — GitHub Release with notes.
6. `@semantic-release/git` — commits `package.json`, `package-lock.json`, `CHANGELOG.md` back as `chore(release): x.y.z [skip ci]` (prevents CI loop).

Existing tags `v3.5.0` are picked up automatically — next release continues from there.

### 4. `package.json`
- `name`: `kaiten-mcp-server` (bin already has this name).
- Add `repository`, `files: ["dist"]`, `publishConfig.access: public`.
- devDependencies: `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git`, `conventional-changelog-conventionalcommits`.

### 5. Dockerfile
Already optimized (multi-stage, alpine, non-root, prod deps only) — unchanged.
`docker-mcp-catalog.yaml` image ref updated to `vadimkorolev/kaiten-mcp-server:latest`.

## Secrets the user must create

| Secret (GitHub → repo Settings → Secrets → Actions) | Where to get it |
|---|---|
| `DOCKERHUB_USERNAME` | `vadimkorolev` (literal) |
| `DOCKERHUB_TOKEN` | hub.docker.com → Account Settings → Personal access tokens → Generate new token, scope **Read & Write** |
| `NPM_TOKEN` | npmjs.com → Access Tokens → Generate new token (Granular, packages **Read and write**, or Classic "Automation") |

`GITHUB_TOKEN` is provided automatically by Actions. Docker Hub repo is
auto-created (public) on first push.

## Error handling

- Tests fail → release job stops before semantic-release; nothing published.
- No release-worthy commits (`docs:`, `chore:` only) → semantic-release exits
  cleanly, docker job skipped.
- Docker push fails after npm publish → re-run docker job only (release job is
  idempotent-safe: semantic-release won't re-release the same commits).

## Out of scope

- Docker Hub README sync (needs admin-scope token; can add later).
- Branch protection / required checks configuration.
