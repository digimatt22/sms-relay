# Deploying this project to Sheldon

Use the Codex skill `$deploy-to-sheldon` for deployment, status, and rollback operations.

- Deployment configuration is in `sheldon.json`.
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
- RelayHub's normal database runtime role is `relayhub_sms_runtime`. PostgreSQL
  role passwords are cluster-global, not per database. Never configure
  RelayHub with the portal's `appuser` role, change `appuser`, or copy the
  portal's canonical PostgreSQL password into RelayHub.
- Keep RelayHub's `DATABASE_URL` in
  `~/.config/sheldon/secrets/relayhub-sms.env`. It must retain the dedicated
  role, `relayhub_sms` database, expected host and port, and correct URL
  encoding. Never print it during inspection or automation.
- `/api/health` is process liveness and intentionally does not query Postgres.
  `/api/ready` verifies database usability with `SELECT 1`; Sheldon uses
  `/api/ready` as its deployment health path.
- Database-role creation, server-secret editing, and RelayHub container
  recreation are separate live operations. Obtain Matthew's explicit
  confirmation immediately before each one.
- Database schema migrations and seed data are separate, explicitly authorized operations; deployment does not run them automatically.
- Verify the health endpoint and public HTTPS after deployment.
- Preserve the prior release for rollback.
