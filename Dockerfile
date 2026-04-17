# Base stage will contain python dependencies
FROM oven/bun:debian AS base
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv bash git && rm -rf /var/lib/apt/lists/*

# Copy the source code
COPY . .
# Remove the python version, otherwise it won't find python
RUN rm .python-version

# Install Python dependencies
RUN python3 -m venv .venv && .venv/bin/pip install "markitdown[pdf]>=0.1.5"

# Use a separate stage for building to save space
FROM base AS builder

# Install dependencies
RUN bun install

# Build the project
RUN bun run build

# Final stage for the image (doing the build separately saves about 100MB)
FROM base AS runner

# Install production dependencies
RUN bun install --production

# Copy the built application
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["bun", "dist/index.js"]
