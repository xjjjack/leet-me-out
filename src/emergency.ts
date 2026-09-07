import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function validShortcut(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('+');
  const key = parts.pop() || '';
  return parts.length > 0 && new Set(parts).size === parts.length &&
    parts.every(p => ['CommandOrControl', 'Control', 'Command', 'Alt', 'Shift'].includes(p)) &&
    parts.some(p => p !== 'Shift') && /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key);
}

export function matchesShortcut(shortcut: string, input: { key: string; control: boolean; meta: boolean; alt: boolean; shift: boolean }, mac: boolean) {
  const parts = shortcut.split('+');
  const key = parts.pop();
  const modifiers = parts.map(p => p === 'CommandOrControl' ? (mac ? 'Command' : 'Control') : p);
  return input.key.toUpperCase() === key && input.control === modifiers.includes('Control') &&
    input.meta === modifiers.includes('Command') && input.alt === modifiers.includes('Alt') && input.shift === modifiers.includes('Shift');
}

export type PasswordRecord = { salt: string; hash: string };

// Only a salted hash is persisted; credentials never go back to the renderer.
export class EmergencyPassword {
  private salt?: Buffer;
  private hash?: Buffer;
  get enabled() { return !!this.hash; }
  export(): PasswordRecord | undefined { return this.hash && this.salt ? { salt: this.salt.toString('hex'), hash: this.hash.toString('hex') } : undefined; }
  restore(value: unknown): boolean {
    this.clear();
    if (!value || typeof value !== 'object') return false;
    const record = value as PasswordRecord;
    if (!/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash)) return false;
    this.salt = Buffer.from(record.salt, 'hex'); this.hash = Buffer.from(record.hash, 'hex'); return true;
  }
  set(password: string) {
    if (password.length > 128) throw new Error('Password is too long');
    this.clear();
    if (password) { this.salt = randomBytes(16); this.hash = scryptSync(password, this.salt, 32); }
  }
  verify(password: string) {
    if (!this.hash || !this.salt) return true;
    if (password.length > 128) return false;
    return timingSafeEqual(this.hash, scryptSync(password, this.salt, 32));
  }
  clear() { this.hash?.fill(0); this.salt?.fill(0); this.hash = undefined; this.salt = undefined; }
}
