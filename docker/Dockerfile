# Stage 1: Build the React client
FROM node:20-slim AS builder
WORKDIR /app/client

# EXACT MATCH: Copy only package.json (forces a clean Linux lockfile generation)
COPY client/package.json ./

# Force install all packages (including Vite in devDependencies)
RUN npm install --include=dev

# Copy source and build
COPY client/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:20-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# EXACT MATCH: Copy only the backend package.json 
COPY package.json ./

# Install only production dependencies natively on Linux (protects SQLite bindings)
RUN npm install --omit=dev

COPY index.js ./
COPY src/ ./src/
# Copy the built client assets from the builder stage
COPY --from=builder /app/client/dist ./client/dist

# Set environment variables for production
ENV NODE_ENV=production
ENV NO_PROMPT=true
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=128

EXPOSE 3000

CMD ["node", "--optimize-for-size", "index.js"]