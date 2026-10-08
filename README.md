# Bloom

Little things, for no reason.

Bloom is a private place for two people. One person leaves a petal: a note, a flower, a memory, a photo, a song, a question, or a small surprise. The other person finds it the way you find flowers that were left for no occasion.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run build
npm start
```

The database and uploaded files live in `.data/` unless you set `BLOOM_DATA_DIR`.

## Tests

```bash
npm test
```

Unit, integration, authorization, scheduling, media, and notification tests.

```bash
npx playwright install chromium
npm run test:e2e
```

The end-to-end test signs up two people, pairs them, leaves a note, and opens it. It starts its own server.

```bash
npm run typecheck
npm run test:all
```

## What you can do

- Create an account, sign in, sign out, and change your password while signed in.
- Invite exactly one person with a short code. The code is shown once. Making a new code retires the old one.
- Leave a petal, preview it, and send it. If the connection drops, retrying the same attempt does not create a second petal.
- Schedule a petal in your own timezone. Clocks that skip an hour (daylight saving) are rejected. Ambiguous times are stored as one UTC instant.
- Open a petal. Opening is remembered. You do not have to answer.
- See the shared garden grow. It is a history, not a score.
- Take a petal back before it is opened.
- Upload a photo or a short audio clip. The server checks the file bytes, not the name or the claimed type.
- Optionally receive one quiet Web Push notification, with no message content, if the server has VAPID keys.

## Stack

- Next.js (App Router) and React
- Node.js built-in SQLite (`node:sqlite`), WAL mode
- Session cookies (HttpOnly, SameSite=Lax). Passwords are hashed with scrypt.
- Zod for input validation
- Luxon for timezone and daylight-saving conversion
- Vitest and Playwright

## Architecture

The browser talks only to Route Handlers under `/api`. Those handlers read the session cookie, then call server modules. Identity, the partner, and ownership are taken from the session. The client cannot choose a sender, a recipient, or a relationship.

Petal types live in `src/domain`. Adding a type means extending the shared schema, the garden mapping, a composer, and a view. Sending, listing, opening, and scheduling stay the same.

Scheduled petals are rows with `status = scheduled` and a UTC `scheduled_for`. A small in-process scheduler, plus a check whenever the garden is loaded, delivers anything that is due. Delivery is a compare-and-set update, so it happens once. Cancelling or editing the row is the scheduled task. There is no second queue to forget.

Notifications are rows with a unique idempotency key per petal and channel. In-app delivery is real. Web Push is attempted only when `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are set. Otherwise the push row is stored as skipped and the product says so. Failed pushes retry with backoff and stop after five attempts. A deleted, cancelled, or expired petal is not pushed.

## Database

SQLite file: `$BLOOM_DATA_DIR/bloom.sqlite`. Media: `$BLOOM_DATA_DIR/media/`.

- `users`, `sessions`
- `relationships`, `relationship_members` (one active membership per person), `invites` (only a hash of the code is stored)
- `petals` with a unique `(sender_id, idempotency_key)`
- `petal_responses`
- `notifications` with a unique idempotency key
- `push_subscriptions`
- `media`
- `garden_elements` (one per petal)
- `rate_limits`

Foreign keys are enforced. Petals and accounts are soft-deleted. Leaving a garden dissolves the relationship and hides it from both people.

## Security

- Authorization is checked on the server for every petal, file, and relationship.
- A guessed id returns “this isn’t here,” including for someone outside the relationship.
- Mutations require a same-origin `Origin` header. Cookies are `SameSite=Lax` and `HttpOnly`.
- Sign-in, pairing, settings, and answers are `POST` forms. A submit before JavaScript loads cannot place a password or a note in the address bar.
- Passwords are scrypt hashes. Sign-in failures share one message. Repeated failures are rate-limited.
- File uploads are sniffed from magic bytes. SVG and HTML are rejected. Names from the client are ignored.
- Media is served only to the two people in that active relationship.
- Production responses do not include stack traces.
- Security headers include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a Content-Security-Policy.

## Production

Run a single Node process. SQLite is the database, so do not point several servers at one file.

1. Put the app behind HTTPS.
2. Set `NODE_ENV=production`.
3. Point `BLOOM_DATA_DIR` at a persistent disk and back up that directory (the database and `media/`).
4. Set `TRUST_PROXY=1` only if a reverse proxy overwrites `X-Forwarded-For`.
5. Leave `BLOOM_RATE_LIMIT` unset (or anything other than `off`).
6. Optional Web Push:

```bash
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:you@example.com`.

Cookies are `Secure` in production. For a local production run over plain HTTP, set `COOKIE_SECURE=0`.

```bash
npm run build
NODE_ENV=production BLOOM_DATA_DIR=/var/bloom/data npm start
```

There is no email transport. Password recovery is changing the password while signed in. A forgotten password cannot be reset by email.

The garden’s seasons follow the northern hemisphere.

Web Push is off until VAPID keys exist. The app does not pretend otherwise.

## Later

- Email, if you add a real mailer, for a forgotten password.
- More than one private pair, still without a social graph.
- Image resizing on the server.
- A replaceable random picker, if a gentler one is ever worth it.
- Southern-hemisphere seasons.
- More than one Node process, which would mean leaving SQLite.
