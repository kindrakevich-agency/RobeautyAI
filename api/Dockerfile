FROM python:3.12-slim

WORKDIR /repo/api
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/repo/api

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
