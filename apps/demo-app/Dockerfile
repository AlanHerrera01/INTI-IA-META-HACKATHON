FROM python:3.12-alpine
RUN adduser -D inti
WORKDIR /app
COPY src ./
USER inti
EXPOSE 8001
CMD ["python", "-m", "http.server", "8001", "--bind", "0.0.0.0"]
