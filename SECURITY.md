# Authentication configuration

The private status page uses a shared `WEB_PASSWORD`. Choose a unique, random
password with at least 20 characters. Do not reuse the Nightscout token or the
session signing secret.

The “Remember me” cookie is renewed as the user accesses protected pages, so
it remains valid during continued use. It expires after 400 days without
activity. A regular session lasts 12 hours.

Set `WEB_SESSION_SECRET` to an independent random value generated with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Configure both values as Fly.io secrets (or local environment variables), not
in `fly.toml` or source control. The application requires a session secret of
at least 32 bytes; its randomness cannot be reliably inferred from length alone.

The Express proxy setting trusts two hops because Fly Proxy forwards the
request and includes its own address in `X-Forwarded-For`. This assumes there
is no additional reverse proxy in front of Fly. If the network topology
changes, review this setting before relying on `req.ip` for login rate limiting.
