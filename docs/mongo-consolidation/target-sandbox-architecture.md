# Disposable target sandbox

`scripts/mongo-consolidation/target-sandbox` creates a synthetic MongoDB 7 three-member set (`sbSandboxRs`) under Docker project `sitebuilder-mongo-target-sandbox`, exclusively on ports 27171–27173. Members require TLS and keyfile internal auth. Runtime certificates, keyfile, logs and data volumes are ignored and removed by `sandbox.sh destroy`.

Run `sandbox.sh up`, `sandbox.sh test`, `sandbox.sh down`, and `sandbox.sh destroy`. It never accepts a Mongo URI, preventing accidental use against local or production deployments.
