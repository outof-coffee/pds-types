# Use the official Node.js Alpine image for a smaller container
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy lexicons first (needed at runtime)
COPY lexicons/ /lexicons/

# Create data folder
RUN mkdir -p /app/data

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Install TypeScript and build the project
RUN npm install -g typescript && \
    npm run build && \
    npm uninstall -g typescript && \
    rm -rf src/ tsconfig.json && \
    npm cache clean --force

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S feedgen -u 1001

# Change ownership of the app directory
RUN chown -R feedgen:nodejs /app
USER feedgen

# Expose port 3580
EXPOSE 3580

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3580/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"]
