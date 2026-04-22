const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV !== "test") {
  console.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const config = {
  port: parseInt(process.env.NOTIFICATION_PORT || "4001", 10),
  mongodbUri: process.env.MONGODB_URI!,
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",
  jwt: {
    secret: process.env.JWT_SECRET!,
  },
  changeStream: {
    batchSize: 100,
    fullDocument: "updateLookup" as const,
    maxAwaitTimeMS: 1000,
  },
};

export default config;
