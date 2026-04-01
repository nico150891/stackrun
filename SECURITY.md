# Security Policy

## Reporting a Vulnerability

Stackrun handles API tokens and credentials. We take security seriously.

**Do not open public issues for security vulnerabilities.**

Instead, email **security@stackrun.dev** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within **48 hours** and work toward a fix. Once resolved, we will credit you in the release notes (unless you prefer to remain anonymous).

## Scope

The following are in scope for security reports:

- Token storage and handling (`~/.stackrun/tokens.json`)
- Authentication flows (API key, bearer, OAuth2)
- Command injection or code execution via manifests
- Network security (token leaking via redirects, HTTP downgrade)
- Manifest validation bypasses

## Known Security Measures

- Tokens stored with `0o600` file permissions (owner read/write only)
- OAuth2 callback server binds to `127.0.0.1` only
- CSRF protection via state parameter in OAuth2 flow
- HTTP redirects disabled for authenticated requests
- `execFile` used instead of `exec` to prevent shell injection
- All manifest `base_url` values must be HTTPS
- Automated security tests in CI (`tests/unit/security.test.ts`)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |
