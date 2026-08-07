import { uuidV7 } from './uuid-v7';

describe('uuidV7', () => {
  it('matches the RFC 9562 version 7 layout', () => {
    expect(uuidV7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('encodes the current time in the leading 48 bits', () => {
    const before = Date.now();
    const timestamp = parseInt(uuidV7().replace(/-/g, '').slice(0, 12), 16);
    const after = Date.now();

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('sorts lexicographically in generation order', () => {
    const generated = Array.from({ length: 20_000 }, () => uuidV7());

    expect([...generated].sort()).toEqual(generated);
  });

  it('stays ordered across a millisecond boundary', async () => {
    const first = uuidV7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = uuidV7();

    expect(second > first).toBe(true);
  });

  it('stays ordered and does not block when the clock steps backwards', () => {
    const real = Date.now;
    const start = real.call(Date);
    try {
      Date.now = () => start;
      const before = Array.from({ length: 5_000 }, () => uuidV7());

      Date.now = () => start - 3_600_000;
      const after = Array.from({ length: 5_000 }, () => uuidV7());

      const all = [...before, ...after];
      expect([...all].sort()).toEqual(all);
      expect(new Set(all).size).toBe(all.length);
    } finally {
      Date.now = real;
    }
  });

  it('does not repeat', () => {
    const generated = Array.from({ length: 20_000 }, () => uuidV7());

    expect(new Set(generated).size).toBe(generated.length);
  });
});
