export class PriceUtils {
  static toCents(amount: number): number {
    return Math.round(amount * 100)
  }

  static toDecimal(cents: number): number {
    return cents / 100
  }
}
