/**
 * Pure interest calculator for préstamos.
 * Annual simple interest, capped at dueDate (no negative days).
 * Extracted from Perc-Accounts-Api/src/modules/loans/loans.service.ts.
 */

export interface InterestInput {
  capital: number;
  rate: number;
  startDate: Date | string;
  dueDate: Date | string;
}

export interface InterestResult {
  days: number;
  interest: number;
  total: number;
}

export function calculateInterest(input: InterestInput): InterestResult {
  const start = new Date(input.startDate);
  const now = new Date();
  const due = new Date(input.dueDate);
  const end = now < due ? now : due;
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
  const interest = input.capital * (input.rate / 100) * (days / 365);
  return { days, interest, total: input.capital + interest };
}
