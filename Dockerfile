FROM oven/bun:1 AS base
WORKDIR /build

# Install dependencies into temp dirs for caching
FROM base AS install

# Dev dependencies (for build)
RUN mkdir -p /temp/dev
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile 2>/dev/null || cd /temp/dev && bun install

# Production dependencies only
RUN mkdir -p /temp/prod
COPY package.json bun.lock* /temp/prod/
RUN cd /temp/prod && (bun install --frozen-lockfile --production 2>/dev/null || bun install --production)

# Build stage
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY tsconfig.json tsup.config.ts package.json ./
COPY src ./src
COPY templates ./templates
RUN bun run build

# Final stage
FROM oven/bun:1-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Go (v1 only supports Go repos)
ARG GO_VERSION=1.24.1
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# Install ripgrep
RUN curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep_15.1.0-1_amd64.deb" -o /tmp/ripgrep.deb && \
    dpkg -i /tmp/ripgrep.deb && \
    rm /tmp/ripgrep.deb

# Install GitHub CLI (gh)
RUN curl -fsSL "https://github.com/cli/cli/releases/download/v2.83.0/gh_2.83.0_linux_amd64.tar.gz" -o /tmp/gh.tar.gz && \
    tar -xzf /tmp/gh.tar.gz -C /tmp && \
    mv /tmp/gh_2.83.0_linux_amd64/bin/gh /usr/local/bin/ && \
    rm -rf /tmp/gh*

# Install GitLab CLI (glab)
RUN curl -fsSL "https://gitlab.com/gitlab-org/cli/-/releases/v1.77.0/downloads/glab_1.77.0_linux_amd64.tar.gz" -o /tmp/glab.tar.gz && \
    tar -xzf /tmp/glab.tar.gz -C /tmp && \
    mv /tmp/bin/glab /usr/local/bin/ && \
    rm -rf /tmp/glab* /tmp/bin

WORKDIR /app

# Copy built application and production deps
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /build/dist ./dist
COPY --from=build /build/templates ./templates
COPY --from=build /build/package.json ./
COPY skills ./skills

ENV COLUMNS=200
ENV LINES=50

# Workspace for cloned/mounted repos
RUN mkdir -p /workspace /tmp/quartermaster /go && \
    chown -R bun:bun /app /workspace /tmp/quartermaster /go

LABEL org.opencontainers.image.title="Quartermaster" \
      org.opencontainers.image.description="Scheduled agent framework for repository maintenance" \
      org.opencontainers.image.url="https://github.com/oddship/quartermaster" \
      org.opencontainers.image.source="https://github.com/oddship/quartermaster" \
      org.opencontainers.image.licenses="MIT"

USER bun

ENTRYPOINT ["bun", "run", "dist/cli.js"]
CMD ["--help"]
