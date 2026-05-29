import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bubble = fs.readFileSync(path.join(root, 'src/app/(app)/inbox/message-bubble.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/api.ts'), 'utf8');

const expectations = [
  [bubble, 'INTERACTIVE_MESSAGE_TYPES', 'MessageBubble declares interactive message types'],
  [bubble, '機器人互動', 'MessageBubble renders the bot interaction label'],
  [bubble, 'callback data', 'MessageBubble renders callback data'],
  [bubble, 'inline_keyboard', 'MessageBubble parses Telegram inline keyboard payloads'],
  [api, 'interactive_payload', 'API Message type carries interactive payloads'],
  [api, "'callback_query'", 'API MessageType includes callback_query'],
  [api, "'button'", 'API MessageType includes button'],
];

const missing = expectations
  .filter(([source, needle]) => !source.includes(needle))
  .map(([, , description]) => description);

if (missing.length > 0) {
  console.error(`Interactive MessageBubble static check failed:\n- ${missing.join('\n- ')}`);
  process.exit(1);
}

console.log('Interactive MessageBubble static check passed');
