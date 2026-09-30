# Sandbox verification report

This is synthetic infrastructure validation, never production evidence.

Verified on 2026-07-19 using Docker project `sitebuilder-mongo-target-sandbox`:

- three MongoDB 7 members reached one PRIMARY and two SECONDARY members after TLS-only bootstrap and then restart under required TLS, keyfile internal authentication, and client authentication;
- `hub_control_app` could write only `sitebuilder_hub`; `hub_site_data_app` could write only `sitebuilder_site_data`; `hub_auditor` could read both and could not write either;
- a majority transaction committed revision, physical-document, registry and audit writes together; an injected abort left no version-999 document;
- stopping the elected primary produced a new primary in 2 seconds, preserved the acknowledged write, accepted a new write, and the stopped member rejoined as a secondary;
- synthetic `mongodump` SHA-256 manifest and `mongorestore` to `sitebuilder_site_data_restore` preserved all collection counts and index keys.

The host-side client cannot use replica discovery because members intentionally advertise Docker-only names. That is a sandbox network boundary, not a production finding. The harness runs database checks from within the Docker network. External hostname-validation and the exact reconciliation-tool scenarios remain to be automated before describing Track B as fully green.
