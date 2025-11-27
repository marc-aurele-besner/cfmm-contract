/**
 * Helper function to calculate required input for exact output swap
 * Using constant product formula with fees
 */
export async function calculateInputForOutput(
  tokenOut: string,
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): Promise<bigint> {
  // Using constant product formula: (reserveIn + amountInWithFee) * (reserveOut - amountOut) = reserveIn * reserveOut
  // Solving for amountInWithFee: amountInWithFee = (reserveIn * reserveOut) / (reserveOut - amountOut) - reserveIn

  // Guard against division by zero
  if (reserveOut <= amountOut || reserveIn === 0n || reserveOut === 0n) {
    throw new Error("Invalid reserves or amountOut for swap calculation");
  }

  const numerator = reserveIn * reserveOut;
  const denominator = reserveOut - amountOut;
  const amountInWithFee = numerator / denominator - reserveIn;

  // Apply fee: amountIn = amountInWithFee * 10000 / (10000 - 25)
  const amountIn = (amountInWithFee * 10000n) / 9975n;

  return amountIn;
}
