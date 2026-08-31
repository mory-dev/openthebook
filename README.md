# OpenTheBook

OpenTheBook is a free, lightweight desktop reader for PDF, EPUB, AZW3, and MOBI files. It is intentionally not a book library: install it, double-click a book, and read.

## Local development

```bash
npm ci
npm run dev              # website
npm run desktop:dev     # Tauri reader
```

Useful checks:

```bash
npm run lint
npm run build
npm run desktop:build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Desktop behavior

- The Windows installer offers PDF, EPUB, AZW3, and MOBI checkboxes. Selected formats are registered per-user and the installer attempts to make OpenTheBook their default app. Windows 10/11 may require a final confirmation in Default apps.
- The reader starts without a sidebar. `Ctrl+T` opens the optional chapter rail.
- Update checks run quietly after launch. A downloaded signed update is installed when the reader closes, ready for the next file-association launch.
- The updater manifest is served from `https://openthebook.lol/updates/latest.json`.

## Releases

Push a tag such as `v0.1.0` to build Windows and Ubuntu artifacts. The release workflow:

1. Builds the NSIS installer, AppImage, and Debian package.
2. Authenticode-signs the Windows installer with Azure Trusted Signing.
3. Signs the final installer and Linux AppImage with the Tauri updater key.
4. Publishes a GitHub Release and `latest.json`.
5. Deploys the website and update manifest to Cloudflare.

Required GitHub Actions secrets and domain notes are in [distribution/release-setup.md](distribution/release-setup.md). The local updater private key lives only in the ignored `.tauri/` directory and must never be committed.

## License

MIT. See [LICENSE](LICENSE).
