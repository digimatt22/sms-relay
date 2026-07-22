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
- Database schema migrations and seed data are separate, explicitly authorized operations; deployment does not run them automatically.
- Verify the health endpoint and public HTTPS after deployment.
- Preserve the prior release for rollback.
