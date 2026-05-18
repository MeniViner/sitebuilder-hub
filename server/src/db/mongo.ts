import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../utils/logger";

mongoose.set("debug", (collectionName, methodName, ...methodArgs) => {
  logger.debug("db", "Mongoose operation", {
    collectionName,
    methodName,
    methodArgs
  });
});

mongoose.connection.on("connecting", () => logger.info("db", "MongoDB connecting"));
mongoose.connection.on("connected", () => logger.info("db", "MongoDB connection event: connected"));
mongoose.connection.on("disconnected", () => logger.warn("db", "MongoDB connection event: disconnected"));
mongoose.connection.on("reconnected", () => logger.info("db", "MongoDB connection event: reconnected"));
mongoose.connection.on("error", (error) => logger.error("db", "MongoDB connection error", { error }));

export const connectMongo = async () => {
  logger.info("db", "MongoDB connect requested", { mongoUri: env.MONGO_URI });
  await mongoose.connect(env.MONGO_URI);
  logger.info("db", "MongoDB connected", { mongoUri: env.MONGO_URI, readyState: mongoose.connection.readyState });
};

export const getMongoStatus = () => {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
};
