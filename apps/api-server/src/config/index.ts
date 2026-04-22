const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV !== "test") {
  console.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const config = {
  port: parseInt(process.env.API_PORT || "4000", 10),
  mongodbUri: process.env.MONGODB_URI!,
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  },
  defaultRetentionPeriod: parseInt(process.env.DEFAULT_RETENTION_PERIOD || "14", 10),
  visibilityTimeout: 30,
  messageRateLimit: {
    windowMs: 60 * 1000,
    max: 100,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
  },
};

export default config;
