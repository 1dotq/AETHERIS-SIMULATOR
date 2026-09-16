export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  chance(probability: number): boolean {
    const bounded = Math.max(0, Math.min(1, probability));
    return this.next() < bounded;
  }
}

export function deriveTurnSeed(matchSeed: number, turn: number): number {
  let value = (matchSeed ^ Math.imul(turn, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

