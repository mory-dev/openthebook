# Contributing

Thanks for helping improve OpenTheBook.

## Development

OpenTheBook uses Node.js 22.13 or newer. Install dependencies with:

```bash
npm ci
```

Run the website with `npm run dev`. To work on the desktop reader, use `npm run desktop:dev`.

## Checks

Before opening a pull request, run the checks relevant to your change:

```bash
npm run build
npm run lint
npm run desktop:build
cargo check --manifest-path src-tauri/Cargo.toml
```

Keep pull requests focused, explain user-visible changes, and include a short testing note. Do not commit credentials, signing keys, generated build output, or private planning files.
