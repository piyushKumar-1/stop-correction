# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Final stage
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "index.js"]
