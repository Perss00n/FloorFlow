FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --bin-links=false \
    && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
# The assistant reads this schema as context; it is never executed at startup.
COPY --chown=node:node db/init/01-schema.sql ./db/init/01-schema.sql
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
