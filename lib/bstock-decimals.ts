function decimalParts(value: string) {
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("Invalid decimal value.");
  const fraction = match[2] || "";
  return { integer: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

function formatDecimal(integer: bigint, scale: number) {
  const negative = integer < 0n;
  const digits = (negative ? -integer : integer).toString().padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function multiplyDecimals(left: string, right: string) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  return formatDecimal(a.integer * b.integer, a.scale + b.scale);
}

export function divideDecimalsRoundUp(left: string, right: string, precision = 18) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (b.integer === 0n) throw new Error("Division by zero.");
  const numerator = a.integer * 10n ** BigInt(b.scale + precision);
  const denominator = b.integer * 10n ** BigInt(a.scale);
  const quotient = (numerator + denominator - 1n) / denominator;
  return formatDecimal(quotient, precision);
}

export function compareDecimals(left: string, right: string) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  const leftInteger = a.integer * 10n ** BigInt(scale - a.scale);
  const rightInteger = b.integer * 10n ** BigInt(scale - b.scale);
  return leftInteger === rightInteger ? 0 : leftInteger < rightInteger ? -1 : 1;
}

/**
 * Convert a split-adjusted bStock share amount to raw token units. Full-balance
 * conversions may round one raw unit above the wallet balance, so cap the
 * result exactly as the official Agentic Wallet CLI does.
 */
export function resolveBstockSellRawAmount(
  shareAmount: string,
  multiplier: string,
  rawBalance: string,
  precision = 18
) {
  const desiredRawAmount = divideDecimalsRoundUp(shareAmount, multiplier, precision);
  return compareDecimals(desiredRawAmount, rawBalance) <= 0 ? desiredRawAmount : rawBalance;
}
