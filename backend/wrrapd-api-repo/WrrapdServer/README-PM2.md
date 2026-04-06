# Wrrapd Server - PM2 Setup Guide

## Problem
The server was crashing after a few hours, requiring manual restarts. This setup uses PM2 to automatically restart the server if it crashes.

## Installation

1. **Install PM2 globally** (if not already installed):
   ```bash
   sudo npm install -g pm2
   ```

2. **Upload files to server**:
   - Upload `ecosystem.config.js` to `/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer/`
   - Upload `start-server.sh` to `/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer/`
   - Make the script executable:
     ```bash
     chmod +x /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer/start-server.sh
     ```

3. **Run the startup script**:
   ```bash
   cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
   ./start-server.sh
   ```

## PM2 Commands

- **View logs**: `pm2 logs wrrapd-server`
- **Restart server**: `pm2 restart wrrapd-server`
- **Stop server**: `pm2 stop wrrapd-server`
- **View status**: `pm2 status`
- **Monitor**: `pm2 monit` (shows CPU, memory usage)
- **View error logs**: `pm2 logs wrrapd-server --err`

## Auto-Start on Boot

PM2 will automatically start the server on system boot after running `pm2 save`. To disable:
```bash
pm2 unstartup
```

## Features

- **Auto-restart**: Server automatically restarts if it crashes
- **Memory limit**: Restarts if memory usage exceeds 500MB
- **Logging**: All logs saved to `logs/` directory
- **Health check**: Server responds to `/health` endpoint for monitoring
- **Error logging**: Errors logged to `error.log` file

## Troubleshooting

If the server still crashes:

1. **Check PM2 logs**:
   ```bash
   pm2 logs wrrapd-server --lines 100
   ```

2. **Check error log**:
   ```bash
   tail -f /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer/error.log
   ```

3. **Check server health**:
   ```bash
   curl http://localhost:8080/health
   ```

4. **Restart PM2**:
   ```bash
   pm2 restart wrrapd-server
   ```

## Manual Restart (if needed)

If PM2 is not working, you can still restart manually:
```bash
pkill -f "nodejs.*server"
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
nohup nodejs server.js > server.log 2>&1 &
```

But with PM2, this should not be necessary!

