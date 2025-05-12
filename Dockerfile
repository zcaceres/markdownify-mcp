FROM node:18-slim

# Install Python and required system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy all files
COPY . /app/

# Install pnpm
RUN npm install -g pnpm@10.10.0

# Setup uv and install Python dependencies
RUN chmod +x setup.sh && ./setup.sh
# Make sure uv is in PATH
ENV PATH="/root/.local/bin:${PATH}"
# Install Python dependencies
RUN uv sync

# Install Node.js dependencies
RUN pnpm install --ignore-scripts

# Build TypeScript manually without running lifecycle scripts
RUN npx tsc && npx shx chmod +x dist/*.js

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port
EXPOSE 8080

# Run the application
CMD ["pnpm", "start"] 