export function getNextOrderSequenceNumber(platformLastNumber: number, counterLastNumber: number): number {
  return Math.max(Number(platformLastNumber) || 0, Number(counterLastNumber) || 0) + 1;
}
