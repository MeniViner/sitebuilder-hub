"use strict";

// Loaded with `node --require` by the self-test's child processes. It turns a
// mistaken network call into a deterministic failure instead of allowing a
// fixture test to reach the operator's network.
const deny = () => {
  const error = new Error("OFFLINE_NETWORK_ATTEMPT");
  error.code = "OFFLINE_NETWORK_ATTEMPT";
  throw error;
};

for (const name of ["http", "https", "net", "tls", "dgram", "dns"]) {
  try {
    const moduleValue = require(name);
    for (const key of ["request", "get", "connect", "createConnection", "lookup", "resolve", "resolve4", "resolve6"]) {
      if (typeof moduleValue[key] === "function") moduleValue[key] = deny;
    }
  } catch { /* Built-in availability varies by supported Node versions. */ }
}

if (typeof globalThis.fetch === "function") globalThis.fetch = deny;
