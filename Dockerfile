FROM oven/bun:debian AS base
WORKDIR /app

# Install git for repomix remote repos
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy the source code
COPY . .

# Use a separate stage for building
FROM base AS builder

# Install dependencies
RUN bun install

# Build the project
RUN bun run build

# Final stage
FROM base AS runner

# Install production dependencies
RUN bun install --production

# Copy the built application
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["bun", "dist/index.js"]
