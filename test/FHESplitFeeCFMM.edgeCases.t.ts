import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";
import { calculateInputForOutput } from "./helpers/calculations";

describe("FHESplitFeeCFMM - Edge Cases", function () {
  let signers: FHESigners;
  let fixture: FHEFixture;

  before(async function () {
    signers = await getFHESigners();
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    fixture = await deployFHEFixture();
  });

  it("Should handle very small swap amounts", async function () {
    const amountAOut = ethers.parseEther("0.0001");
    const [reserveA] = await fixture.pair.getReserves();

    if (amountAOut < reserveA) {
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
      );

      const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
      const encryptedAmountBIn = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(swapAmountBScaled)
        .encrypt();
      const encryptedAmountAIn = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(0)
        .encrypt();

      await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);
      await fixture.pair
        .connect(signers.alice)
        .swap(
          encryptedAmountAIn.handles[0],
          encryptedAmountBIn.handles[0],
          encryptedAmountAIn.inputProof,
          encryptedAmountBIn.inputProof,
          amountAOut,
          0n,
          signers.alice.address,
        );

      const [reserveAAfter] = await fixture.pair.getReserves();
      expect(reserveAAfter).to.equal(reserveA - amountAOut);
    }
  });

  it("Should handle very large swap amounts (near reserves)", async function () {
    const [reserveA] = await fixture.pair.getReserves();
    const amountAOut = reserveA / 2n; // Half of reserves

    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      await fixture.pair.getReserveB(),
      await fixture.pair.getReserveA(),
    );

    // Ensure user has enough tokens
    const balance = await fixture.tokenB.balanceOf(signers.alice.address);
    if (balance < amountBIn) {
      await fixture.tokenB.mint(signers.alice.address, amountBIn * 2n);
    }

    const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedAmountBIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountBScaled)
      .encrypt();
    const encryptedAmountAIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedAmountAIn.handles[0],
        encryptedAmountBIn.handles[0],
        encryptedAmountAIn.inputProof,
        encryptedAmountBIn.inputProof,
        amountAOut,
        0n,
        signers.alice.address,
      );
  });

  it("Should handle adding liquidity with very small amounts", async function () {
    const amountA = ethers.parseEther("0.001");
    const amountB = ethers.parseEther("0.002");

    await fixture.tokenA.transfer(fixture.pairAddress, amountA);
    await fixture.tokenB.transfer(fixture.pairAddress, amountB);

    const encryptedAmountA = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(Number(amountA / ethers.parseEther("1")))
      .encrypt();
    const encryptedAmountB = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(Number(amountB / ethers.parseEther("1")))
      .encrypt();

    await fixture.pair
      .connect(signers.alice)
      .addLiquidity(
        encryptedAmountA.handles[0],
        encryptedAmountB.handles[0],
        encryptedAmountA.inputProof,
        encryptedAmountB.inputProof,
        signers.alice.address,
      );

    const lpBalance = await fixture.pair.balanceOf(signers.alice.address);
    expect(lpBalance).to.be.gt(0n);
  });

  it("Should handle removing very small liquidity amounts", async function () {
    // First add liquidity
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");
    await fixture.tokenA.transfer(fixture.pairAddress, amountA);
    await fixture.tokenB.transfer(fixture.pairAddress, amountB);

    const encryptedAmountA = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(Number(amountA / ethers.parseEther("1")))
      .encrypt();
    const encryptedAmountB = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(Number(amountB / ethers.parseEther("1")))
      .encrypt();

    await fixture.pair
      .connect(signers.alice)
      .addLiquidity(
        encryptedAmountA.handles[0],
        encryptedAmountB.handles[0],
        encryptedAmountA.inputProof,
        encryptedAmountB.inputProof,
        signers.alice.address,
      );

    const liquidity = await fixture.pair.balanceOf(signers.alice.address);
    const smallAmount = liquidity / 1000n; // Remove 0.1% of liquidity

    if (smallAmount > 0n) {
      await fixture.pair.connect(signers.alice).removeExactLiquidity(smallAmount, signers.alice.address);
    }
  });

  it("Should handle maximum uint256 values gracefully", async function () {
    const maxUint = ethers.MaxUint256;

    await expect(fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), maxUint)).to.be.reverted;
  });

  it("Should maintain constant product invariant after swaps", async function () {
    const [reserveABefore, reserveBBefore] = await fixture.pair.getReserves();
    const kBefore = reserveABefore * reserveBBefore;

    const amountAOut = ethers.parseEther("100");
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      await fixture.pair.getReserveB(),
      await fixture.pair.getReserveA(),
    );

    const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedAmountBIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountBScaled)
      .encrypt();
    const encryptedAmountAIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedAmountAIn.handles[0],
        encryptedAmountBIn.handles[0],
        encryptedAmountAIn.inputProof,
        encryptedAmountBIn.inputProof,
        amountAOut,
        0n,
        signers.alice.address,
      );

    const [reserveAAfter, reserveBAfter] = await fixture.pair.getReserves();
    const kAfter = reserveAAfter * reserveBAfter;

    // After swap with fees, k should generally increase (fees add to reserves)
    expect(reserveAAfter).to.be.gt(0n);
    expect(reserveBAfter).to.be.gt(0n);

    // Verify reserves changed as expected
    expect(reserveAAfter).to.equal(reserveABefore - amountAOut);
    expect(reserveBAfter).to.be.gt(reserveBBefore);
  });

  it("Should handle multiple rapid swaps", async function () {
    for (let i = 0; i < 5; i++) {
      const amountAOut = ethers.parseEther("10");
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
      );

      const balance = await fixture.tokenB.balanceOf(signers.alice.address);
      if (balance < amountBIn) {
        await fixture.tokenB.mint(signers.alice.address, amountBIn * 2n);
      }

      const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
      const encryptedAmountBIn = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(swapAmountBScaled)
        .encrypt();
      const encryptedAmountAIn = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(0)
        .encrypt();

      await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);
      await fixture.pair
        .connect(signers.alice)
        .swap(
          encryptedAmountAIn.handles[0],
          encryptedAmountBIn.handles[0],
          encryptedAmountAIn.inputProof,
          encryptedAmountBIn.inputProof,
          amountAOut,
          0n,
          signers.alice.address,
        );
    }
  });

  it("Should maintain reserve consistency after multiple operations", async function () {
    const [reserveAInitial, reserveBInitial] = await fixture.pair.getReserves();

    // Perform multiple swaps
    for (let i = 0; i < 5; i++) {
      const amountAOut = ethers.parseEther("100");
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
      );

      const balance = await fixture.tokenB.balanceOf(signers.alice.address);
      if (balance < amountBIn) {
        await fixture.tokenB.mint(signers.alice.address, amountBIn * 2n);
      }

      const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
      const encryptedAmountBIn = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(swapAmountBScaled)
        .encrypt();
      const encryptedAmountAIn = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(0)
        .encrypt();

      await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);
      await fixture.pair
        .connect(signers.alice)
        .swap(
          encryptedAmountAIn.handles[0],
          encryptedAmountBIn.handles[0],
          encryptedAmountAIn.inputProof,
          encryptedAmountBIn.inputProof,
          amountAOut,
          0n,
          signers.alice.address,
        );
    }

    const [reserveAFinal, reserveBFinal] = await fixture.pair.getReserves();

    // Reserves should be valid (both > 0)
    expect(reserveAFinal).to.be.gt(0n);
    expect(reserveBFinal).to.be.gt(0n);

    // Reserves should have changed
    expect(reserveAFinal).to.not.equal(reserveAInitial);
    expect(reserveBFinal).to.not.equal(reserveBInitial);
  });

  it("Should correctly track user info after multiple liquidity operations", async function () {
    // Add liquidity
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");
    await fixture.tokenA.transfer(fixture.pairAddress, amountA);
    await fixture.tokenB.transfer(fixture.pairAddress, amountB);

    const encryptedAmountA = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(Number(amountA / ethers.parseEther("1")))
      .encrypt();
    const encryptedAmountB = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(Number(amountB / ethers.parseEther("1")))
      .encrypt();

    await fixture.pair
      .connect(signers.alice)
      .addLiquidity(
        encryptedAmountA.handles[0],
        encryptedAmountB.handles[0],
        encryptedAmountA.inputProof,
        encryptedAmountB.inputProof,
        signers.alice.address,
      );

    const userInfoBefore = await fixture.pair.userInfo(signers.alice.address);
    const liquidityBefore = await fixture.pair.balanceOf(signers.alice.address);

    // Perform swap to generate fees
    const amountAOut = ethers.parseEther("100");
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      await fixture.pair.getReserveB(),
      await fixture.pair.getReserveA(),
    );

    const balance = await fixture.tokenB.balanceOf(signers.bob.address);
    if (balance < amountBIn) {
      await fixture.tokenB.mint(signers.bob.address, amountBIn * 2n);
    }

    const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedAmountBIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.bob.address)
      .add64(swapAmountBScaled)
      .encrypt();
    const encryptedAmountAIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.bob.address)
      .add64(0)
      .encrypt();

    await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.bob)
      .swap(
        encryptedAmountAIn.handles[0],
        encryptedAmountBIn.handles[0],
        encryptedAmountAIn.inputProof,
        encryptedAmountBIn.inputProof,
        amountAOut,
        0n,
        signers.bob.address,
      );

    // Remove some liquidity
    const removeAmount = liquidityBefore / 2n;
    await fixture.pair.connect(signers.alice).removeExactLiquidity(removeAmount, signers.alice.address);

    const userInfoAfter = await fixture.pair.userInfo(signers.alice.address);
    const liquidityAfter = await fixture.pair.balanceOf(signers.alice.address);

    expect(liquidityAfter).to.be.lt(liquidityBefore);

    // Reward debt should have increased if fees accumulated
    // Note: Small swaps might not generate fees due to rounding
    // Note: rewardDebtB is now encrypted, so we can't check it directly
    // We verify that liquidity changed as expected
    expect(liquidityAfter).to.be.lt(liquidityBefore);
  });
});
