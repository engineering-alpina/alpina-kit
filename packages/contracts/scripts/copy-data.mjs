// tsc does not emit imported .json into outDir reliably across versions, so the
// registry data is copied explicitly. Keeps `@alpina/contracts/services.json`
// resolvable for consumers that want the raw file rather than the parsed export.
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, 'dist', 'data'), { recursive: true });
await cp(join(root, 'src', 'data', 'services.json'), join(root, 'dist', 'data', 'services.json'));
