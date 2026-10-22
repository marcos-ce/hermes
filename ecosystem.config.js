module.exports = {
  apps: [{
    name: 'wpp-admin-bot',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '250M',
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
