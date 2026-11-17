FROM node:20-slim

# Install Python 3.10+, pip, and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package manifests and install Node dependencies
COPY backend/package*.json ./backend/
RUN npm install --prefix backend --omit=dev

# Copy ML requirements and install Python dependencies
COPY backend/ml/requirements.txt ./backend/ml/
RUN pip3 install --no-cache-dir --break-system-packages -r backend/ml/requirements.txt

# Copy backend source, libraries, routes, models, and ML artifacts
COPY backend ./backend

ENV PORT=5000
ENV NODE_ENV=production
ENV PYTHON_EXECUTABLE=python3

EXPOSE 5000

CMD ["node", "backend/server.js"]
