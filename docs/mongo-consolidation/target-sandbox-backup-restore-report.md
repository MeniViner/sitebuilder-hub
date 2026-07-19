# Sandbox backup and restore gate

Synthetic-only backup/restore passed on 2026-07-19. `mongodump` created a SHA-256 manifest of every BSON and metadata file for `sitebuilder_site_data`; `mongorestore` restored it only to `sitebuilder_site_data_restore`. A read-only comparison then verified equal collection counts and index keys for every source collection.

No existing local or production database was restored, altered, or used as a source.
