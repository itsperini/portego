FROM node:26-bookworm-slim AS build

RUN npm install --global pnpm@11.1.3

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_PORTEGO_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_PORTEGO_API_URL=$NEXT_PUBLIC_PORTEGO_API_URL
RUN pnpm --filter @portego/web build

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3100
CMD ["node", "apps/web/server.js"]
