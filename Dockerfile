# Base stage will contain python dependencies
FROM node:current-alpine3.22 AS base
WORKDIR /app

# Install dependencies
RUN apk add --no-cache python3 curl bash

# Copy the source code
COPY . .
# Remove the python version, otherwise it won't find python
RUN rm .python-version

# Enable pnpm
RUN corepack enable

# Install Python dependencies
RUN ./setup.sh

# Use a separate stage for building to save space
FROM base AS builder

# Install Node.js dependencies
RUN pnpm install

# Build the project
RUN pnpm run build

# Set the entry point
ENTRYPOINT ["node", "dist/index.js"]

# Final stage for the image (doing the build separately saves about 100MB)
FROM base AS runner

# Install production Node.js dependencies
RUN pnpm install --production

# Copy the built application
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]