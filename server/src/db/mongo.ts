import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { assertSiteIndexStartupPolicy, inspectSiteIndexes, SiteIndexInspection } from "./siteIndexes";
import { getMongoTopology, safeMongoError, sanitizeMongoTarget } from "./mongoTarget";

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
mongoose.connection.on("error", (error) =>
  logger.error("db", "MongoDB connection error", { error: safeMongoError(error, sanitizeMongoTarget(env.MONGO_URI).database) })
);

type ConnectMongoDependencies = {
  connect?: typeof mongoose.connect;
  inspect?: () => Promise<SiteIndexInspection>;
  connection?: typeof mongoose.connection;
};

export const connectMongo = async (dependencies: ConnectMongoDependencies = {}) => {
  const connect = dependencies.connect || mongoose.connect.bind(mongoose);
  const inspect = dependencies.inspect || inspectSiteIndexes;
  const connection = dependencies.connection || mongoose.connection;
  const target = sanitizeMongoTarget(env.MONGO_URI);
  logger.info("db", "MongoDB connect requested", { target });
  try {
    await connect(env.MONGO_URI, { autoIndex: false, autoCreate: false });
  } catch (error) {
    const safeError = safeMongoError(error, target.database);
    logger.error("db", "MongoDB connection failed", { error: safeError, target });
    throw new Error(safeError.message);
  }

  const inspection = await inspect();
  const connectionMetadata = getMongoTopology(connection);
  logger.info("db", "MongoDB connected and inspected", { target, ...connectionMetadata, indexValidation: inspection });
  assertSiteIndexStartupPolicy(inspection, env.NODE_ENV);
  return inspection;
};

export const getMongoStatus = () => {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
};
