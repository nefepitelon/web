FROM python:3.11.14-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir jesse==3.1.1
WORKDIR /state
ENTRYPOINT ["python", "/integration/run.py"]
