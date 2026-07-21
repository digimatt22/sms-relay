# RelayHub SMS

RelayHub SMS is a locally runnable SMS gateway hub with an admin dashboard, Postgres-backed message queue, and a Raspberry Pi Zero 2 W gateway service for SIM7070G outbound and inbound SMS.

## Local Hub

1. Copy `.env.example` to `.env.local` and set `AUTH_SECRET`.
2. Start Postgres:
   ```sh
   docker compose up -d postgres
   ```
3. Install dependencies:
   ```sh
   npm install
   ```
4. Run migrations and seed an admin:
   ```sh
   npm run db:migrate
   npm run db:seed-admin
   ```
5. Start the dashboard:
   ```sh
   npm run dev
   ```

The default local administrator is `mwood@digicolony.com` with the temporary
password `change-me-now`. The dashboard requires that password to be changed
immediately after the first successful sign-in.

Dashboard target: `https://sns.digicolony.net` through Cloudflare Tunnel, or `http://localhost:3000` during direct local development.

## Gateway Installer

The installer endpoint is:

```sh
curl https://sns.digicolony.net/install | sudo bash
```

The installer assumes Raspberry Pi OS is already installed. It prompts for:
- RelayHub server URL
- gateway API key
- APN, defaulting to `wholesale` for Tello testing
- carrier, defaulting to `Tello`
- modem mode
- serial device
- SIMCom network mode, defaulting to `CNMP=38` and `CMNB=1` for LTE Cat-M

For local packaging:

```sh
npm run gateway:package
```

This writes `public/gateway.tar.gz`, which the installer downloads by default from `https://sns.digicolony.net/gateway.tar.gz`.

## MVP Flow

1. Log in to the dashboard.
2. Create a gateway and store the one-time API key.
3. Install the gateway service on a Raspberry Pi Zero 2 W.
4. Create a message from `/messages/new`.
5. The gateway claims the message, sends through the SIM7070G path, and updates the dashboard.
6. Replies are read from the SIM7070G unread SMS inbox, uploaded to `/inbox`, and deleted from the modem after the hub accepts them.

## Inbound Replies

Inbound SMS is polled by the gateway with the same gateway API key used for outbound claiming. The hub stores each reply in `inbound_messages` and tries to match it to the most recent outbound message sent to that phone number with a `callback_url`.

When a match has a callback URL, the hub posts:

```json
{
  "event": "sms.inbound.received",
  "inboundMessageId": "...",
  "matchedOutboundMessageId": "...",
  "gatewayId": "...",
  "from": "+15551234567",
  "fromRedacted": "***-***-4567",
  "body": "STOP",
  "receivedAt": "2026-07-03T21:00:00.000Z",
  "metadata": {}
}
```
