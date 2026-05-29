import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const backendRoot = join(repoRoot, 'backend/app');
const frontendRoot = join(repoRoot, 'frontend/src');

const ignored = new Set([
  // Transport lifecycle and intentionally server-only events go here.
]);

function files(root, predicate) {
  const found = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!['node_modules', '.next', '__pycache__'].includes(name)) {
        found.push(...files(full, predicate));
      }
    } else if (predicate(full)) {
      found.push(full);
    }
  }
  return found;
}

function collect(regex, source, target) {
  for (const match of source.matchAll(regex)) {
    target.add(match[1]);
  }
}

const emitted = new Set();
for (const file of files(backendRoot, (path) => path.endsWith('.py'))) {
  const source = readFileSync(file, 'utf8');
  collect(/emit_scoped\s*\(\s*event\s*=\s*['"`]([^'"`]+)['"`]/g, source, emitted);
  collect(/emit_to_(?:role|user|team)\s*\(\s*[^,\n]+,\s*['"`]([^'"`]+)['"`]/g, source, emitted);
  collect(/emit_to_all\s*\(\s*['"`]([^'"`]+)['"`]/g, source, emitted);
  collect(/_emit_to_handler_and_supervisors\s*\(\s*[^,\n]+,\s*['"`]([^'"`]+)['"`]/g, source, emitted);
  collect(/_emit_message_action\s*\(\s*[^,\n]+,\s*['"`]([^'"`]+)['"`]/g, source, emitted);
  if (source.includes('def emit_new_message(')) emitted.add('new_message');
  if (source.includes('def emit_contact_updated(')) emitted.add('contact.updated');
}

const subscribed = new Set();
for (const file of files(frontendRoot, (path) => path.endsWith('.tsx') || path.endsWith('.ts'))) {
  const source = readFileSync(file, 'utf8');
  collect(/useWebSocketEvent(?:<[^>]+>)?\s*\(\s*['"`]([^'"`]+)['"`]/g, source, subscribed);
}

const missing = [...emitted]
  .filter((event) => !subscribed.has(event) && !ignored.has(event))
  .sort();

console.log(JSON.stringify({
  emitted: [...emitted].sort(),
  subscribed: [...subscribed].sort(),
  ignored: [...ignored].sort(),
  missing,
}, null, 2));

if (missing.length > 0) {
  console.error(`Missing frontend realtime subscriptions: ${missing.join(', ')}`);
  process.exit(1);
}
