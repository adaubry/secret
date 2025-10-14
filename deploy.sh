#!/usr/bin/env bash

APP_NAME="polymarket-copytrading"
LOG_DIR="/home/ubuntu/deploy-logs"
WORK_DIR="/home/ubuntu"

# Set PATH with all required binaries
export PATH="/usr/local/bin:/usr/bin:/bin"

LOG_FILE="$LOG_DIR/deploy-prep-$(date +%Y%m%d-%H%M%S).log"

# Redirect all output to log file
exec > "$LOG_FILE" 2>&1

echo "==============================="
echo "DEPLOY PREP START: $(date)"
echo "User: $(whoami)"
echo "Home: $HOME"
echo "PWD: $(pwd)"
echo "PATH: $PATH"
echo "==============================="

# Change to work directory
echo "Changing to directory: $WORK_DIR"
cd "$WORK_DIR" || {
    echo "ERROR: Failed to change to $WORK_DIR"
    exit 1
}

echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

# Git pull
echo "Running git pull..."
sudo git pull || {
    echo "ERROR: Git pull failed"
    exit 1
}

# PM2 flush
echo "Flushing PM2 logs..."
sudo pm2 flush || {
    echo "WARNING: PM2 flush failed (continuing anyway)"
}

# Clean dist
echo "Cleaning dist folder..."
if [ -d "dist" ]; then
    sudo rm -rf dist/*
    echo "Dist folder cleaned"
else
    echo "Dist folder does not exist"
fi

# Build
echo "Running npm build..."
sudo npm run build || {
    echo "ERROR: npm build failed"
    exit 1
}

# Check .env
echo "Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found"
    exit 1
fi

# Check dist
echo "Checking dist folder..."
if [ ! -d "dist" ]; then
    echo "ERROR: dist folder not created after build"
    exit 1
fi

echo "==============================="
echo "DEPLOY PREP SUCCESS: $(date)"
echo "==============================="

# Log rotation
echo "Rotating old logs..."
ls -1t "$LOG_DIR"/deploy-prep-*.log 2>/dev/null | tail -n +6 | xargs -r rm -f

echo "Deployment complete!"
exit 0
