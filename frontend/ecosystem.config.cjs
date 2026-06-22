module.exports = {
  apps: [{
    name: 'alash-shop',
    script: 'npm',
    args: 'start',
    cwd: '/home/ubuntu/alashed-shop/frontend',
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
  }]
}
