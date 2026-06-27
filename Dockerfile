# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Run production build (Vite + esbuild)
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_MODE=local

# Copy built artifacts and minimized packages
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Open ingress port
EXPOSE 3000

# Run standalone bundled CommonJS server
CMD ["npm", "start"]
