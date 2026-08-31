# Release setup

OpenTheBook releases are published by pushing a semver tag such as `v0.1.0`.

## GitHub Actions secrets

Configure these in the repository’s `release` environment:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of the ignored `.tauri/openthebook.key` file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the updater-key passphrase (blank for the initial local key)
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `AZURE_ACCOUNT_NAME`, `AZURE_CERT_PROFILE_NAME`
- `CLOUDFLARE_API_TOKEN`: a token allowed to deploy the OpenTheBook Worker
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account that owns `openthebook.lol`

The Windows job uses Azure Trusted Signing for Authenticode, then re-signs the final NSIS installer with the Tauri updater key. The release job publishes `latest.json` and deploys the website so existing readers can prepare the update for their next launch.

## Domain state

`openthebook.lol` is configured as a Cloudflare zone. Dynadot is still the registrar, with Cloudflare authoritative nameservers. Cloudflare Email Routing has a verified destination at `dario@mory.dev` and an enabled catch-all route for `*@openthebook.lol`.

## Distribution

After the first public release, use [listing-copy.md](listing-copy.md) to submit the signed installers and release URL to AlternativeTo, Product Hunt, SaaSHub, Linux package directories, and relevant communities. Keep every listing linked to the canonical website and GitHub release.
