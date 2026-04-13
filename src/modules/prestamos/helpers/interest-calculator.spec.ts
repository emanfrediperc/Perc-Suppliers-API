/**
 * Interest calculation cross-reference tests.
 * Values cross-validated against the original Perc-Accounts HTML simulator.
 * Ported from Perc-Accounts-Api/src/modules/loans/loans-interest.spec.ts.
 */
import { calculateInterest } from './interest-calculator';

describe('calculateInterest — seed data cross-reference', () => {
  const fixedNow = new Date('2026-04-09T12:00:00Z');
  let dateSpy: jest.SpyInstance;

  beforeEach(() => {
    const realDate = Date;
    dateSpy = jest.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
      if (args.length === 0) return fixedNow;
      return new realDate(...(args as [any]));
    });
  });

  afterEach(() => dateSpy.mockRestore());

  it('Seed #1: USD 250K, 8%, 2025-12-01 to 2026-06-30 (active)', () => {
    const r = calculateInterest({
      capital: 250_000,
      rate: 8,
      startDate: new Date('2025-12-01'),
      dueDate: new Date('2026-06-30'),
    });
    // 2025-12-01 to 2026-04-09 = 129 days (now < dueDate)
    expect(r.days).toBe(129);
    expect(r.interest).toBeCloseTo(250_000 * 0.08 * (129 / 365), 2);
  });

  it('Seed #2: ARS 150M, 45%, 2026-01-15 to 2026-07-15 (active)', () => {
    const r = calculateInterest({
      capital: 150_000_000,
      rate: 45,
      startDate: new Date('2026-01-15'),
      dueDate: new Date('2026-07-15'),
    });
    // 2026-01-15 to 2026-04-09 = 84 days
    expect(r.days).toBe(84);
    expect(r.interest).toBeCloseTo(150_000_000 * 0.45 * (84 / 365), 0);
  });

  it('Seed #3: USD 80K, 7.5%, 2025-09-01 to 2026-03-01 (matured, days capped at dueDate)', () => {
    const r = calculateInterest({
      capital: 80_000,
      rate: 7.5,
      startDate: new Date('2025-09-01'),
      dueDate: new Date('2026-03-01'),
    });
    // Capped at dueDate: 2025-09-01 to 2026-03-01 = 181 days
    expect(r.days).toBe(181);
    expect(r.interest).toBeCloseTo(80_000 * 0.075 * (181 / 365), 2);
  });

  it('Seed #5: USDC 515K, 5.5%, 2026-01-01 to 2026-06-30 (active)', () => {
    const r = calculateInterest({
      capital: 515_000,
      rate: 5.5,
      startDate: new Date('2026-01-01'),
      dueDate: new Date('2026-06-30'),
    });
    // 2026-01-01 to 2026-04-09 = 98 days
    expect(r.days).toBe(98);
    expect(r.interest).toBeCloseTo(515_000 * 0.055 * (98 / 365), 2);
  });

  it('Seed #6: ARS 50M, 55%, 2025-03-01 to 2025-09-01 (cleared, days capped)', () => {
    const r = calculateInterest({
      capital: 50_000_000,
      rate: 55,
      startDate: new Date('2025-03-01'),
      dueDate: new Date('2025-09-01'),
    });
    // Capped at dueDate: 2025-03-01 to 2025-09-01 = 184 days
    expect(r.days).toBe(184);
    const expected = 50_000_000 * 0.55 * (184 / 365);
    expect(r.interest).toBeCloseTo(expected, 0);
    expect(r.total).toBeCloseTo(50_000_000 + expected, 0);
  });

  it('edge: start === due → 0 days, 0 interest', () => {
    const r = calculateInterest({
      capital: 100_000,
      rate: 10,
      startDate: new Date('2026-04-09'),
      dueDate: new Date('2026-04-09'),
    });
    expect(r.days).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.total).toBe(100_000);
  });

  it('edge: start in the future → days clamped to 0', () => {
    const r = calculateInterest({
      capital: 100_000,
      rate: 10,
      startDate: new Date('2026-05-01'),
      dueDate: new Date('2026-12-01'),
    });
    expect(r.days).toBe(0);
    expect(r.interest).toBe(0);
  });
});
