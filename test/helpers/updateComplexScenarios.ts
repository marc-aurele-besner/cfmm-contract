// This is a helper script to update complex scenario tests
// It's not meant to be imported, just a reference for patterns

export async function createEncryptedLiquidityForRouter(
  pairAddress: string,
  userAddress: string,
  amountA: bigint,
  amountB: bigint
) {
  const { fhevm } = await import("hardhat");
  const encryptedAmountA = await fhevm
    .createEncryptedInput(pairAddress, userAddress)
    .add64(Number(amountA / BigInt(1e18)))
    .encrypt();
  const encryptedAmountB = await fhevm
    .createEncryptedInput(pairAddress, userAddress)
    .add64(Number(amountB / BigInt(1e18)))
    .encrypt();
  
  return {
    encryptedAmountA: encryptedAmountA.handles[0],
    encryptedAmountB: encryptedAmountB.handles[0],
    amountAProof: encryptedAmountA.inputProof,
    amountBProof: encryptedAmountB.inputProof,
  };
}

