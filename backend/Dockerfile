# Bed Manager API (Express + Socket.IO + scheduled reports)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so this layer is cached between code changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Run as the unprivileged "node" user that the image provides
RUN chown -R node:node /app
USER node

EXPOSE 5001
CMD ["node", "server.js"]
