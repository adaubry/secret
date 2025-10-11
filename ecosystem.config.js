module.exports = {
  apps: [
    {
      name: "polymarket-copytrading",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "prod",
      },
    },
  ],
};
