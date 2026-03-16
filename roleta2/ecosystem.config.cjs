// ecosystem.config.cjs — PM2 cluster config para 1000+ usuários
module.exports = {
  apps: [{
    name: 'roleta3',
    script: 'server.js',
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    node_args: '--max-old-space-size=512',

    // Variáveis de ambiente padrão
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },

    // Graceful restart
    kill_timeout: 5000,
    listen_timeout: 10000,
    wait_ready: false,

    // Auto-restart em caso de memory leak
    max_memory_restart: '500M',

    // Logs
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',

    // Watch desabilitado em prod
    watch: false,
  }],
};
