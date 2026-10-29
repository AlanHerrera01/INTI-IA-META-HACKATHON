FROM python:3.12-alpine
RUN adduser -D inti
WORKDIR /app
COPY server.py faults.py verification_server.py ./
COPY src ./src
COPY verification ./verification
RUN mkdir /app/data && chown inti:inti /app/data
USER inti
EXPOSE 8001
CMD ["python", "server.py", "--db", "/app/data/inventory.db", "--fault-host", "0.0.0.0"]
