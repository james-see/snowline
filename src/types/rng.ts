export interface Rng {
  readonly seed: number;
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  gaussian(mean?: number, stddev?: number): number;
  onSphere(out: { x: number; y: number; z: number }): void;
  inDisc(out: { x: number; y: number }): void;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  fork(label: string): Rng;
}
