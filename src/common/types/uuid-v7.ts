import { randomBytes } from 'node:crypto';

const MAX_SEQUENCE = 0x0fff;

let lastTimestamp = -1;
let sequence = 0;

export function uuidV7(): string {
  const now = Date.now();

  if (now > lastTimestamp) {
    lastTimestamp = now;
    sequence = 0;
  } else if (sequence < MAX_SEQUENCE) {
    sequence += 1;
  } else {
    lastTimestamp += 1;
    sequence = 0;
  }

  const bytes = randomBytes(16);
  bytes.writeUIntBE(lastTimestamp, 0, 6);
  bytes[6] = 0x70 | (sequence >>> 8);
  bytes[7] = sequence & 0xff;
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
