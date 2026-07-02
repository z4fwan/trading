# Dockerfile
FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy app
COPY . .

# Build Next.js
RUN npm run build

# Set environment
ENV NODE_ENV=production
ENV RENDER=true
ENV PORT=7860

EXPOSE 7860

CMD ["npm", "start"]
