export type SafeMongoTarget = {
  protocol: "mongodb" | "mongodb+srv" | "unknown";
  hosts: Array<{ alias: string; port?: number }>;
  database: string;
  replicaSet?: string;
  tlsConfigured: boolean;
  authenticationConfigured: boolean;
};

const safeName = (value: string, fallback: string) =>
  /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : fallback;
const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return ""; } };

export const sanitizeMongoTarget = (uri: string, databaseOverride?: string): SafeMongoTarget => {
  const match = String(uri || "").match(/^(mongodb(?:\+srv)?):\/\/([^/?#]*)(?:\/([^?#]*))?(?:\?([^#]*))?/i);
  if (!match) {
    return {
      protocol: "unknown",
      hosts: [],
      database: safeName(String(databaseOverride || ""), "[unknown]"),
      tlsConfigured: false,
      authenticationConfigured: false
    };
  }

  const protocol = match[1].toLowerCase() as "mongodb" | "mongodb+srv";
  const authority = match[2];
  const authenticationConfigured = authority.includes("@");
  const hostList = authority.slice(authority.lastIndexOf("@") + 1).split(",").filter(Boolean);
  const query = new URLSearchParams(match[4] || "");
  const tlsValue = String(query.get("tls") || query.get("ssl") || "").toLowerCase();

  return {
    protocol,
    hosts: hostList.map((host, index) => {
      const portMatch = host.match(/:(\d+)$/);
      return {
        alias: `mongo-host-${index + 1}`,
        ...(portMatch ? { port: Number(portMatch[1]) } : {})
      };
    }),
    database: safeName(String(databaseOverride || safeDecode(match[3] || "")), "[unknown]"),
    ...(query.get("replicaSet")
      ? { replicaSet: safeName(String(query.get("replicaSet")), "[redacted]") }
      : {}),
    tlsConfigured: protocol === "mongodb+srv" || ["true", "1"].includes(tlsValue),
    authenticationConfigured
  };
};

export const safeMongoError = (error: unknown, database: string) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return {
    name: error instanceof Error ? error.name : "MongoConnectionError",
    message: `Target Mongo connection failed for database ${safeName(database, "[unknown]")}`,
    ...(code ? { code } : {})
  };
};

export const getMongoTopology = (connection: {
  readyState?: number;
  getClient?: () => unknown;
}) => {
  const client = connection.getClient?.() as { topology?: { description?: { type?: string } } } | undefined;
  return {
    connectionStatus: connection.readyState === 1 ? "connected" : "disconnected",
    topology: client?.topology?.description?.type || "unknown"
  };
};
