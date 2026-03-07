# Base stage will contain python dependencies
FROM oven/bun:debian AS base
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 curl bash && rm -rf /var/lib/apt/lists/*

# Copy the source code
COPY . .
# Remove the python version, otherwise it won't find python
RUN rm .python-version

# Install Python dependencies
RUN ./setup.sh

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
