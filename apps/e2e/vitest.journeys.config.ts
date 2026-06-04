export default {
  test: {
    environment: "node",
    include: ["journeys/**/*.e2e.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 1,
    isolate: true,
  },
};
