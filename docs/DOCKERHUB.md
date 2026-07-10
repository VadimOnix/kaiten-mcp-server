# Kaiten MCP Server

MCP (Model Context Protocol) server for [Kaiten](https://kaiten.ru) — manage cards, comments, tags, spaces and boards directly from Claude Desktop, Claude Code or any MCP-compatible client.

- **GitHub:** [VadimOnix/kaiten-mcp-server](https://github.com/VadimOnix/kaiten-mcp-server)
- **npm:** [kaiten-mcp-server](https://www.npmjs.com/package/kaiten-mcp-server)
- **License:** MIT

## Supported tags

- `latest` — most recent release
- `X.Y.Z`, `X.Y`, `X` — semver pinning (e.g. `3.5.1`, `3.5`, `3`)

Multi-arch: `linux/amd64`, `linux/arm64`. Released automatically from `main` via semantic-release.

## Quick start (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest",
        "-e", "KAITEN_API_TOKEN=your_token_here",
        "-e", "KAITEN_DEFAULT_SPACE_ID=12345",
        "vadimkorolev/kaiten-mcp-server:latest"
      ]
    }
  }
}
```

Restart Claude Desktop completely after editing the config.

The server speaks MCP over **stdio** — no ports to expose. The image runs as a non-root user.

## Docker MCP Gateway

The image carries the `io.docker.server.metadata` label, so it works with Docker Desktop's MCP Toolkit / Gateway out of the box. A ready-made catalog entry lives in the repo: [`docker-mcp-catalog.yaml`](https://github.com/VadimOnix/kaiten-mcp-server/blob/main/docker-mcp-catalog.yaml).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `KAITEN_API_URL` | yes | Must end with `/api/latest`, e.g. `https://your-domain.kaiten.ru/api/latest` |
| `KAITEN_API_TOKEN` | yes | Kaiten API token (profile settings), min 20 chars |
| `KAITEN_DEFAULT_SPACE_ID` | no | Default space for card operations (recommended) |
| `KAITEN_INSECURE_SSL` | no | `true` to skip TLS verification (corporate proxy / self-signed certs) |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | no | 1–20, default 5 |
| `KAITEN_CACHE_TTL_SECONDS` | no | Cache TTL, default 300, `0` disables |
| `KAITEN_REQUEST_TIMEOUT_MS` | no | Default 10000 |
| `KAITEN_LOG_LEVEL` | no | `debug`…`emergency`, default `error` (logs go to stderr only) |

Full logging/tuning reference: [README on GitHub](https://github.com/VadimOnix/kaiten-mcp-server#readme).

## What's inside

- Tools for cards (create/update/search with token-efficient responses), comments, tags, card members & responsible, spaces, boards, columns, lanes, types
- Verbosity control (`minimal` / `normal` / `detailed`) — responses trimmed by 92–96%
- LRU cache with TTL, retry with exponential backoff, concurrency limiting, idempotency keys on mutations
- Structured output schemas (MCP 2025-11-25)

## Issues & contributing

Bug reports and PRs: [GitHub issues](https://github.com/VadimOnix/kaiten-mcp-server/issues) · [CONTRIBUTING](https://github.com/VadimOnix/kaiten-mcp-server/blob/main/CONTRIBUTING.md)
