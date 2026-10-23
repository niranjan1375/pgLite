# Credentials File Format

pgLite can load environments from a local credentials file:

- Default path: `.pgconsole/credentials.json`
- Optional override: `PGLITE_CREDENTIALS_FILE=/absolute/path/to/credentials.json`

The file is read server-side only and supports this structure:

```json
{
    "environments": [
        {
            "id": "prod-us",
            "name": "Production US",
            "host": "prod-us.example.com",
            "port": 5432,
            "user": "postgres",
            "password": "replace_me",
            "database": "app_db",
            "requiresVPN": true
        }
    ]
}
```

Required fields per environment:

- `id`
- `host`
- `user`
- `database`

Optional fields:

- `name` (defaults to `id`)
- `port` (defaults to `5432`)
- `password` (defaults to empty string)
- `requiresVPN` (defaults to `false`)
- `production` — write queries ask for confirmation. When omitted it is
  inferred: `true` if the id contains `prod`/`uat`/`staging` or the host
  contains `prod`.
- `ssl` — `verify` (default for remote hosts: certificate and hostname are
  checked), `require` (encrypted, not verified — logged as a warning for
  production envs), or `disable` (default for `localhost`).
- `sslCa` — path to a PEM CA bundle used by `verify`, relative to the working
  directory. Azure Postgres verifies with Node's built-in CAs; AWS RDS needs
  its bundle: `curl -o .pgconsole/rds-global-bundle.pem
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` and set
  `"sslCa": ".pgconsole/rds-global-bundle.pem"`. A missing file is an error
  for that environment. Legacy env-var setups can use `NODE_EXTRA_CA_CERTS`.

Loading order:

1. `.pgconsole/credentials.json` (or `PGLITE_CREDENTIALS_FILE`)
2. `PGLITE_ENVIRONMENTS_JSON`
3. Legacy namespaced env vars (`LOADTEST_*`, etc.)

Use `credentials.example.json` as the starter template and keep real values only in `.pgconsole/credentials.json`.
