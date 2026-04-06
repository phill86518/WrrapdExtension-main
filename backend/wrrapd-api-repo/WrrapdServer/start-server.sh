#!/bin/bash

# Wrrapd Server Startup Script with PM2
# This script ensures the server stays running and auto-restarts on crashes

cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing PM2..."
    sudo npm install -g pm2
fi

# Stop any existing PM2 process
pm2 stop wrrapd-server 2>/dev/null || true
pm2 delete wrrapd-server 2>/dev/null || true

# Kill any existing nodejs server processes
pkill -f "nodejs.*server" 2>/dev/null || true
sleep 2

# Start server with PM2
echo "Starting Wrrapd server with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration to start on system boot
pm2 save

# Show status
pm2 status

echo ""
echo "Server started with PM2!"
echo "To view logs: pm2 logs wrrapd-server"
echo "To restart: pm2 restart wrrapd-server"
echo "To stop: pm2 stop wrrapd-server"
echo "To monitor: pm2 monit"

