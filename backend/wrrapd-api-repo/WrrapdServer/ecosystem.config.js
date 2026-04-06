module.exports = {
  apps: [{
    name: 'wrrapd-server',
    script: 'server.js',
    cwd: '/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    env: {
      NODE_ENV: 'production'
    },
    // Restart if server becomes unresponsive
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    // Auto-restart on crash
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};

