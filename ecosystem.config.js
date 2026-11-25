/*
 * PM2 process file for link-organizer-api.
 *
 *   npm run build                          # pm2 runs the compiled dist/ — build first
 *   pm2 start ecosystem.config.js          # start (or: pm2 reload ecosystem.config.js)
 *   ENV_FILE=/path/to/.env pm2 start ecosystem.config.js --update-env
 *
 * Configuration is not copied into PM2. The app loads the dotenv file named by
 * DOTENV_CONFIG_PATH itself (src/config.ts), so edits to that file take effect
 * on the next `pm2 restart link-organizer-api`.
 */
const fs = require('node:fs')
const path = require('node:path')

const CONFIG_DIR = '/etc/app-configs/link-mgmnt'
let envFile = process.env.ENV_FILE || path.join(CONFIG_DIR, '.env')

// Accept the config directory itself, same as bin/startup.sh.
if (fs.existsSync(envFile) && fs.statSync(envFile).isDirectory()) {
  envFile = path.join(envFile, '.env')
}

// Fail here rather than letting PM2 crash-loop an app with no config:
// dotenv silently ignores a missing file and the app would fall back to defaults.
try {
  fs.accessSync(envFile, fs.constants.R_OK)
} catch {
  throw new Error(`ecosystem.config.js: config file not found or not readable: ${envFile}`)
}

module.exports = {
  apps: [
    {
      name: 'link-organizer-api',
      cwd: __dirname,
      script: 'dist/server.js',
      node_args: '--enable-source-maps',
      instances: 1, // runs migrations at startup; don't use cluster mode
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      kill_timeout: 10000, // server.ts closes HTTP + DB on SIGINT
      time: true, // timestamp log lines
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: envFile,
      },
    },
  ],
}
