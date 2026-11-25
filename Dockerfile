# Base stage will contain python dependencies
FROM oven/bun:debian AS base
WORKDIR /app

# Use uv to install the same locked Python dependencies as local setup.
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv bash git && rm -rf /var/lib/apt/lists/*

# Copy the source code
COPY . .

# Keep the slim PDF profile; explicitly use Debian's supported Python rather
# than downloading the local development interpreter from .python-version.
RUN uv sync --locked --extra pdf --no-dev --python /usr/bin/python3 --no-python-downloads

# Use a separate stage for building to save space
FROM base AS builder

# Python is already installed above; do not run the full-profile preinstall.
RUN bun install --frozen-lockfile --ignore-scripts

# Build the project
RUN bun run build

# Final stage for the image (doing the build separately saves about 100MB)
FROM base AS runner

# Install production dependencies
RUN bun install --production --frozen-lockfile --ignore-scripts

# Copy the built application
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["bun", "dist/index.js"]
