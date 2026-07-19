# Sandbox isolation matrix

| Principal | HUB read/write | Site data read/write |
| --- | --- | --- |
| `hub_control_app` | allow | deny |
| `hub_site_data_app` | deny | allow |
| `hub_auditor` | read only | read only |
| `hub_backup` | backup/restore roles only | backup/restore roles only |

The test runs explicit negative cross-database writes; any success is a blocker.
