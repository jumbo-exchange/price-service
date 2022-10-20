# Building stage
FROM node:16-alpine AS builder

WORKDIR /build

# Add dependencies as a separate layer
ADD *.json /build/

RUN npm install

ADD . /build

RUN npm run build

# Production stage
FROM node:16-alpine

WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/*.json ./

RUN npm install --production

EXPOSE 3001

USER node

CMD npm run update-database && npm run start:prod
