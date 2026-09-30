# Offline bundle self-test fixtures

These files are synthetic fixtures for the portable offline Windows evidence bundle.
They contain no production evidence, credentials, or live endpoints. `run-self-test.mjs`
expects the staged bundle layout and checks the reconciliation exit-code contract without
requiring MongoDB, npm, `mongosh`, network access, or administrator privileges.

The negative command fixture is deliberately unsafe source text. It is only supplied to
the command-policy scanner by the self-test; a release scanner must exclude negative
fixtures from its normal executable-path allowlist and reject the same command everywhere
else in the bundle.
