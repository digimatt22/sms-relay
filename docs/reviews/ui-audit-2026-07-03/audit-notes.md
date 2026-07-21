# RelayHub SMS UI/UX Audit

Date: 2026-07-03
Scope: MVP dashboard surfaces needed to create gateways, send outbound SMS, inspect message state, and review gateway logs.

## Evidence

- `01-login.png`
- `02-message-queue.png`
- `03-send-message.png`
- `04-message-detail.png`
- `05-gateways.png`
- `06-logs.png`

## Review Steps

1. Logged in as the seeded local admin.
2. Reviewed the message queue after a gateway mock submission.
3. Reviewed the send-message form used for dashboard test sends.
4. Reviewed the message detail page for result, body, metadata, and attempts.
5. Reviewed gateway creation, installer copy, gateway list, and health surfaces.
6. Reviewed logs for gateway startup, modem initialization, claim, and submitted events.

## Fixes Applied

- Changed raw status and event enum labels to operator-readable labels, e.g. `Carrier Submitted` and `Message Claimed`.
- Added stable layout sizing for sidebar/content and prevented status pills from wrapping.
- Updated the dashboard installer command to include `sudo`.
- Prefilled gateway carrier and APN with the MVP 1NCE defaults: `1NCE` and `iot.1nce.net`.

## Remaining Notes

- The dashboard is suitable for MVP testing by admins.
- Logs can wrap at narrow widths because they contain long message IDs. This is acceptable for MVP but should become a filtered/detail workflow before higher-volume operations.
- A future operator workflow should add log filters by gateway, message ID, event type, and date range.
