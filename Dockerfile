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

# Copy package files
COPY package.json pnpm-lock.yaml pyproject.toml ./

# Install pnpm
RUN npm install -g pnpm@10.10.0

# Setup uv and install Python dependencies
COPY setup.sh ./
RUN chmod +x setup.sh && ./setup.sh

# Install Node.js dependencies
RUN pnpm install

# Copy application code
COPY . /app/

# Build TypeScript
RUN pnpm build

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port
EXPOSE 8080

# Run the application
CMD ["pnpm", "start"] 