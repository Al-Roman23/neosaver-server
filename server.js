// This File Handles The Entry Point Of The Application
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const logger = require("./src/utils/logger");
const { connectDB, ensureIndexes, client } = require("./src/config/db");
const { errorHandler } = require("./src/middlewares/errorHandler");

const app = express();
const port = process.env.PORT || 3000;

// Apply Global Middleware
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

app.use(helmet()); // 11 Military-Grade Security Headers
app.use(cors());
app.use(express.json());

// Global API Rate Limiter: Max 100 Requests Per 15 Minutes Per IP
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100, 
  message: { success: false, error: "Too Many Requests! Please Try Again Later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/v1/api", apiLimiter);

// Health Check Endpoint
app.get("/health", async (req, res) => {
  try {
    await client.db().command({ ping: 1 });
    res.json({ success: true, message: "Neosaver-Server API Running!" });
  } catch (err) {
    logger.error({ err }, "Health Check Failed!");
    res.status(500).json({ success: false, message: "Database Connection Failed!" });
  }
});

// Register Api Routes
const v1Routes = require("./src/routes/v1.index");

app.use("/v1/api", v1Routes);

// Global Error Handler
app.use(errorHandler);

let serverInstance;

// Import Socket Service Definition And Background Worker
const SocketService = require("./src/core/socket");
const BackgroundWorker = require("./src/core/worker");

async function startServer() {
  try {
    await connectDB();
    await ensureIndexes();

    serverInstance = app.listen(port, () => {
      logger.info(`Service Is Live And Fully Operational On Port ${port}!`);
    });

    // Initialize Websockets And Background Processes
    SocketService.init(serverInstance);
    BackgroundWorker.start(); // Global Reconciliation Heartbeat

  } catch (error) {
    logger.fatal({ error }, "Failed to start server!");
    process.exit(1);
  }
}

// Graceful Shutdown Handler
async function shutdown(signal) {
  logger.info(`Received ${signal}. Closing server...`);
  if (serverInstance) {
    serverInstance.close(async () => {
      logger.info("HTTP server closed!");
      BackgroundWorker.stop(); // Stop Background Processes
      await client.close();
      logger.info("MongoDB connection closed!");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
