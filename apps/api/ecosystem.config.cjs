module.exports = {
  apps: [
    {
      name: "advo-api",
      script: "npx",
      args: "tsx src/index.ts",
      cwd: "/opt/advo-api",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 6407,
      },
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/advo-api/error.log",
      out_file: "/var/log/advo-api/out.log",
      merge_logs: true,
    },
  ],
};
