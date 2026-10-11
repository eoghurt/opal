// Loads Opal's vault-file code straight from the repo, in plain Node (no
// Electron, no window): the shared CommonJS files and the window's ES modules.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
export const shared = (name) => require(new URL(`shared/${name}.js`, root).pathname);
export const src = (path) => import(new URL(`src/${path}.js`, root).href);
