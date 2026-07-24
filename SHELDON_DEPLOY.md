# Deploying this project to Sheldon

Use the team-marketplace Sheldon Deploy package for deployment, status, and
rollback operations. The checked-in manifest requires the enhanced
`sheldon-deploy/0.2.0` schema-2 contract. The marketplace currently published
0.1.x tooling may be used for read-only status of the existing schema-1 release,
but it must not package or deploy this schema-2 manifest.

- Deployment configuration is in `sheldon.json`.
- Release candidates come only from `npm run release:package -- OUTPUT_DIR`.
  The command requires an exact checked-out commit, a completely clean
  worktree, a sensitive-path audit, SHA-256, and provenance sidecars.
- Never build production from the workspace directory. Build from the audited
  release archive declared by the manifest.
- Run tests and verify the production Dockerfile before deployment.
- Never commit or upload `.env` files. Secrets live on Sheldon in `~/.config/sheldon/secrets/<app>.env`.
- Applications must listen on `0.0.0.0` inside the container.
- Preview the deployment plan before changing the server.
- Run the remote preflight before packaging or building.
- Deployments bind only to loopback and are exposed through Caddy.
- Cloudflare needs a Published application route from the manifest hostname to `http://localhost:80`.
- Keep the Cloudflare HTTP Host Header override unset so Caddy receives the public hostname. Visiting `localhost:80` directly may legitimately show Caddy's default site.
- For Auth.js/NextAuth, set `AUTH_URL` to the canonical public HTTPS hostname and verify generated callback URLs after deployment.
- Set `PLATFORM_NAME` to the customer-facing brand shown in page titles, navigation, authentication, and security SMS messages.
- Set `DEBUG_BYPASS_RECIPIENT_CONSENT=true` only on development deployments to bypass verified opt-in records. Active programs, STOP opt-outs, and platform suppressions remain enforced. Leave it `false` everywhere else.
- RelayHub owns a dedicated PostgreSQL 17 instance and persistent volume. Keep
  the database name `relayhub_sms`, use `relayhub_sms_owner` only for
  initialization/migration, and use the non-owning `relayhub_sms_runtime` role
  for the application. Never configure RelayHub with the portal's `appuser`,
  change `appuser`, or copy the portal's canonical PostgreSQL password.
- Keep RelayHub's `DATABASE_URL` in
  `~/.config/sheldon/secrets/relayhub-sms.env`. It must retain the dedicated
  role, `relayhub_sms` database, expected host and port, and correct URL
  encoding. Never print it during inspection or automation.
- `/api/health` is process liveness and intentionally does not query Postgres.
  `/api/ready` verifies database usability with `SELECT 1`; Sheldon uses
  `/api/ready` as its deployment health path.
- Database-instance/volume creation, role creation, server-secret editing,
  stopping writes, production backup/migration, and container recreation are
  separate live operations. Obtain Matthew's explicit confirmation immediately
  before each operation.
- Database schema migrations are run only with `MIGRATION_DATABASE_URL` through
  `npm run db:migrate:production`. They are separate, explicitly authorized
  operations; deployment never runs them automatically.
- The database runtime role has a 20-connection ceiling and role-level
  statement, lock, and idle-transaction timeouts. The application pool is
  bounded at 10 connections with finite connect and idle timeouts.
- Relay Hub/host monitoring runs outside the application containers. Relay Hub
  SMS must not be the only notification channel for its own outage.
- Verify the health endpoint and public HTTPS after deployment.
- Preserve the prior release for rollback.
