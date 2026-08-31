import fs from 'node:fs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Usage: node scripts/set-version.mjs <semver>');
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.version = version;
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriPath = 'src-tauri/tauri.conf.json';
const tauriConfig = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauriConfig.version = version;
fs.writeFileSync(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoPath = 'src-tauri/Cargo.toml';
const cargo = fs.readFileSync(cargoPath, 'utf8').replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`OpenTheBook version set to ${version}`);
