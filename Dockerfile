# =============================================================================
# Kaiten MCP Server - Production Docker Image
# =============================================================================
# Best practices applied:
# - Multi-stage build (minimal final image)
# - Non-root user (security)
# - Alpine base (small footprint)
# - Production dependencies only
# - MCP stdio transport (no port exposure needed)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for TypeScript build)
COPY package.json package-lock.json* ./
RUN npm ci

# Build TypeScript
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Install CA certificates for HTTPS (fixes "unable to get local issuer certificate")
RUN apk add --no-cache ca-certificates && update-ca-certificates

# MCP server annotations
LABEL io.modelcontextprotocol.server.name="mcp-kaiten"
LABEL org.opencontainers.image.source="https://github.com/VadimOnix/kaiten-mcp-server"
LABEL org.opencontainers.image.description="MCP server for Kaiten API integration"

# Required for Docker MCP Gateway (self-configured / docker://)
# Without this label: "No server info found", "Server not yet created"
LABEL io.docker.server.metadata="{\"name\":\"mcp-kaiten\",\"description\":\"MCP server for Kaiten API - cards, comments, spaces, boards\",\"command\":[\"node\",\"dist/index.js\"],\"env\":[{\"name\":\"KAITEN_API_URL\",\"value\":\"{{mcp-kaiten.api-url}}\"},{\"name\":\"KAITEN_DEFAULT_SPACE_ID\",\"value\":\"{{mcp-kaiten.space-id}}\"}],\"secrets\":[{\"name\":\"mcp-kaiten.api-token\",\"env\":\"KAITEN_API_TOKEN\",\"example\":\"your_kaiten_api_token\"}]}"

# Create non-root user (security best practice)
RUN addgroup -g 1001 -S mcp && \
    adduser -u 1001 -S mcp -G mcp

WORKDIR /app

# Copy production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Ownership
RUN chown -R mcp:mcp /app

USER mcp

# MCP uses stdio transport - no CMD args needed, node runs and reads stdin
ENTRYPOINT ["node", "dist/index.js"]
