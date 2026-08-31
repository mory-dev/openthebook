import fs from 'node:fs';
import path from 'node:path';

const [version, artifactsDir = 'release-artifacts', output = 'public/updates/latest.json'] = process.argv.slice(2);
if (!version) throw new Error('Usage: node scripts/build-update-manifest.mjs <version> [artifacts-dir] [output]');

const repository = process.env.GITHUB_REPOSITORY ?? 'openthebook/openthebook';
const tag = `v${version}`;
const baseUrl = `https://github.com/${repository}/releases/download/${tag}`;

function findFile(folder, suffix) {
  const files = fs.readdirSync(folder).filter((file) => file.endsWith(suffix));
  if (files.length !== 1) throw new Error(`Expected one ${suffix} file in ${folder}, found ${files.length}`);
  return files[0];
}

const windowsDir = path.join(artifactsDir, 'windows');
const linuxDir = path.join(artifactsDir, 'linux');
const windowsFile = findFile(windowsDir, '.exe');
const linuxFile = findFile(linuxDir, '.AppImage');
const windowsSignature = fs.readFileSync(path.join(windowsDir, `${windowsFile}.sig`), 'utf8').trim();
const linuxSignature = fs.readFileSync(path.join(linuxDir, `${linuxFile}.sig`), 'utf8').trim();

const manifest = {
  version,
  notes: `OpenTheBook ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': { signature: windowsSignature, url: `${baseUrl}/${windowsFile}` },
    'linux-x86_64': { signature: linuxSignature, url: `${baseUrl}/${linuxFile}` },
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${output}`);
