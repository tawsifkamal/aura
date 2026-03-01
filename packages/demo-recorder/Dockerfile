FROM python:3.12-slim

# System deps for Playwright + ffmpeg + git
RUN apt-get update && apt-get install -y \
    git curl ffmpeg \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Install demo-recorder from local source
WORKDIR /app
COPY . /app/

RUN pip install --no-cache-dir -e .

# Install Playwright browser
RUN playwright install chromium

# Default workdir for recordings
WORKDIR /workspace

# Entry point
ENTRYPOINT ["python", "-m", "demo_recorder.cli"]
