# Manifest Validation Rules

## When to Validate

- On `stackrun install <tool>` — before saving the manifest locally
- On `stackrun call <tool> <command>` — before executing the API call

## Required Fields

Every manifest MUST have:
- `name` — non-empty string, lowercase, alphanumeric + hyphens
- `version` — semver string (e.g., "1.0.0")
- `description` — non-empty string
- `base_url` — valid HTTPS URL
- `auth.type` — one of: "none", "api_key", "bearer"
- `commands` — non-empty array

## Command Validation

Each command MUST have:
- `name` — non-empty string, lowercase, alphanumeric + underscores
- `method` — one of: "GET", "POST", "PUT", "PATCH", "DELETE"
- `path` — string starting with "/"
- `description` — non-empty string

## Auth Validation

- If `auth.type` is "api_key" or "bearer", `auth.header` MUST be present
- `auth.prefix` is optional (defaults to empty string)

## Error Messages

When validation fails, show:
1. Which field is invalid
2. What value was received
3. What was expected
