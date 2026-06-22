# bypass-links

Same-origin Express and React app for bypassing supported links, gated by Hack Club Auth. The existing Telegram webhook bot still extracts links from messages, sends them through the bypass.vip Premium API, and replies with the final result.

## Setup

```sh
npm install
cp .env.example .env
```

Fill in:

- `TELEGRAM_BOT_TOKEN`
- `WEBHOOK_BASE_URL`
- `TELEGRAM_WEBHOOK_SECRET`
- `BYPASS_API_KEY`
- `BYPASS_API_AUTH_HEADER` should be `x-api-key` for bypass.vip Premium.
- `APP_ORIGIN`
- `DATABASE_URL` for PostgreSQL-backed revocable sessions
- `HACK_CLUB_CLIENT_ID`
- `HACK_CLUB_CLIENT_SECRET`
- `HACK_CLUB_REDIRECT_URI`
- `JWT_ACCESS_SECRET`
- `OUTBOUND_TIMEOUT_MS` defaults to `8000`.
- `OUTBOUND_MAX_RETRIES` defaults to `2` and applies only to safe/idempotent requests.
- `SKIP_TELEGRAM_WEBHOOK` can be set to `true` for local web UI development with placeholder Telegram credentials.

`WEBHOOK_BASE_URL` must be a public HTTPS origin. On startup the app registers:

```txt
${WEBHOOK_BASE_URL}/telegram/webhook
```

For local Hack Club Auth testing, add this redirect URI to the Hack Club OAuth app:

```txt
http://localhost:3000/oauth/callback
```

Production should use:

```txt
https://bypass.ch3n.cc/oauth/callback
```

## Run

```sh
npm run db:migrate
npm run build
npm start
```

Run `npm run db:migrate` before deploying each version. Migrations are versioned and safe to run repeatedly. Refresh credentials are opaque, stored as hashes, rotated after use, and revoked server-side on logout or replay.

For frontend-only development:

```sh
npm run dev
```

For the API server with file watching:

```sh
npm run dev:server
```

## Test

```sh
npm test
npm run lint
npm run build
```

## Security behavior

- Request logs contain URL paths but omit query strings, OAuth codes, cookies, and tokens.
- Submitted links must use public HTTP(S) destinations. Local, private, reserved, credential-bearing, and non-standard-port URLs are rejected before reaching the bypass provider, including hostnames whose DNS records resolve to non-public addresses.
- Refresh sessions have an absolute 30-day lifetime. Concurrent rotations within a short grace window return the same replacement credential; later reuse revokes the entire session family.
- Outbound requests use timeouts. Only safe/idempotent requests receive bounded retries; duplicate-prone POST requests do not retry automatically.
