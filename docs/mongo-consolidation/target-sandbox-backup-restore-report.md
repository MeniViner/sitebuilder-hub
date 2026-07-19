# Sandbox backup and restore gate

No backup/restore pass is claimed until a synthetic-only `mongodump` manifest (collections, counts, indexes, hashes) is restored to a separate disposable database and compared. Never restore an existing local or production database.
