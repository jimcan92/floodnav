export class WarningGate {
  private seen = new Set<string>();
  accept(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
  reset() {
    this.seen.clear();
  }
}
export class RequestGate {
  private version = 0;
  next() {
    return ++this.version;
  }
  isCurrent(version: number) {
    return version === this.version;
  }
}
export function advanceProgress(current: number, delta: number, total: number) {
  return Math.max(0, Math.min(total, current + delta));
}
