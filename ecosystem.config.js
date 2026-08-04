module.exports = {
  apps: [
    {
      name: "nextjs-dashboard",
      script: "npm",
      args: "run start",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "python-ml-engine",
      script: "python",
      args: "-m uvicorn main:app --host 0.0.0.0 --port 8000",
      cwd: "./backend",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
