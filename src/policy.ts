import { EmergencyPassword } from './emergency';

export class FocusPolicy {
  readonly password = new EmergencyPassword();
  enabled = false;
  mayClose = false;
  recovery = false;
  failures = 0;
  enable(password: string, recovery: boolean) {
    if (!password || password.length > 128) throw new Error('A password is required');
    this.password.set(password); this.enabled = true; this.mayClose = false; this.recovery = recovery; this.failures = 0;
  }
  accepted() { if (this.enabled) this.mayClose = true; }
  newSession() { this.mayClose = false; }
  verify(password: string): 'valid' | 'invalid' | 'recovered' {
    if (!this.enabled) return 'invalid';
    if (this.password.verify(password)) { this.failures = 0; return 'valid'; }
    this.failures++;
    if (this.recovery && this.failures >= 10) {
      this.enabled = false; this.mayClose = false; this.recovery = false; this.failures = 0; this.password.clear(); return 'recovered';
    }
    return 'invalid';
  }
  export() { return { enabled: this.enabled, recovery: this.recovery, failures: this.failures, credential: this.password.export() }; }
  restore(value: unknown) {
    this.enabled = false; this.mayClose = false; this.recovery = false; this.failures = 0; this.password.clear();
    if (!value || typeof value !== 'object') return;
    const stored = value as Record<string, unknown>;
    if (stored.enabled === true && this.password.restore(stored.credential)) {
      this.enabled = true; this.recovery = stored.recovery === true;
      this.failures = typeof stored.failures === 'number' && Number.isInteger(stored.failures) ? Math.max(0, Math.min(9, stored.failures)) : 0;
    }
  }
}
