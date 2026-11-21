FROM node:20-alpine AS build
ARG VITE_PUBLIC_BACKEND_URL=http://localhost:4000
ENV VITE_PUBLIC_BACKEND_URL=$VITE_PUBLIC_BACKEND_URL
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
