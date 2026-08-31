import { readFile, writeFile } from 'node:fs/promises';

const configPath = process.argv[2] ?? 'dist/server/wrangler.json';
const config = JSON.parse(await readFile(configPath, 'utf8'));

// The custom domains are provisioned separately and already point to this
// Worker. Keeping routes out of CI deployments avoids requiring zone-route
// write access for every website release.
if (Array.isArray(config.routes)) {
  const routeCount = config.routes.length;
  delete config.routes;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Preserved existing custom domains by removing ${routeCount} route definitions.`);
} else {
  console.log('No route definitions found; continuing with the existing deployment configuration.');
}
