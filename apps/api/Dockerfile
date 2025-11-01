# syntax = docker/dockerfile:1

# Base image
FROM node:20.18.0-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.11.0

# Install Playwright dependencies (for unsubscribe automation)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Builder stage - installs deps and builds
FROM base AS build
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files to resolve workspace deps
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/config/tsconfig.base.json ./packages/config/

# Install all dependencies (including devDependencies for build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code
COPY apps/api ./apps/api
COPY packages/db ./packages/db

# Generate Prisma Client
RUN cd packages/db && pnpm exec prisma generate

# Build the API
RUN cd apps/api && pnpm build

# Production stage - minimal runtime image
FROM base AS production
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/config/tsconfig.base.json ./packages/config/

# Install only production dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Copy built artifacts and Prisma schema
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/prisma ./packages/db/prisma

# Install Prisma CLI globally and generate client
RUN npm install -g prisma@5.19.1 && cd packages/db && prisma generate

# Install Playwright Chromium in production
RUN cd apps/api && pnpm exec playwright install --with-deps chromium

# Set working directory to API
WORKDIR /app/apps/api

# Expose port
EXPOSE 4000

# Start the API
CMD ["node", "dist/index.js"]
