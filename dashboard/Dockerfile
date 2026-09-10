FROM node:24-alpine

WORKDIR /app

COPY server.mjs ./server.mjs
COPY dashboard-current-node.js ./dashboard-current-node.js

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.mjs"]
