FROM node:22-bookworm-slim

RUN npm install -g pixel-agents

ENV NODE_ENV=production
ENV HOME=/home/node

USER node
WORKDIR /home/node

EXPOSE 3100

CMD ["pixel-agents", "--host", "0.0.0.0", "--port", "3100", "--no-terminal"]