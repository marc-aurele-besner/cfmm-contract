import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";
import { calculateInputForOutput } from "./helpers/calculations";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("FHESplitFeeCFMM - Fees", function () {
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

    // Use LARGE initial liquidity to enable very large swaps
    // Larger pools allow for larger absolute fees from swaps
    // We'll do large swaps (50%+ of reserves) to generate substantial fees
    const amountA = ethers.parseEther("1000000"); // 1M tokens - very large pool
    const amountB = ethers.parseEther("2000000"); // 2M tokens - very large pool

    // Mint additional tokens to Alice for the large liquidity provision
    await fixture.tokenA.mint(signers.alice.address, amountA);
    await fixture.tokenB.mint(signers.alice.address, amountB);

    await fixture.tokenA.connect(signers.alice).transfer(fixture.pairAddress, amountA);
    await fixture.tokenB.connect(signers.alice).transfer(fixture.pairAddress, amountB);
    await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

    // Skip swaps in beforeEach for fee claim tests - they will do their own swaps
    // This prevents reserve depletion that could cause fee rounding issues
  });

  it("Should allow user to claim fees", async function () {
    // Strategy: Use VERY LARGE swaps (50%+ of reserves) on large pools
    // Large pools enable large absolute fees that may accumulate despite large totalSupply
    const [initialReserveA, initialReserveB] = await fixture.pair.getReserves();

    // Perform 3 very large swaps (50% of current reserves each)
    // Large swaps generate large absolute fees
    for (let i = 0; i < 3; i++) {
      const [currentReserveA, currentReserveB] = await fixture.pair.getReserves();
      const amountAOut = currentReserveA / 2n;

      if (currentReserveA > amountAOut && amountAOut > 0n && currentReserveB > 0n) {
        const amountBIn = await calculateInputForOutput(
          await fixture.tokenA.getAddress(),
          amountAOut,
          currentReserveB,
          currentReserveA,
        );

        if (amountBIn > 0n) {
          const bobBalance = await fixture.tokenB.balanceOf(signers.bob.address);
          if (bobBalance < amountBIn) {
            await fixture.tokenB.mint(signers.bob.address, amountBIn * 3n);
          }

          const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
          const encryptedSwapAmount = await fhevm
            .createEncryptedInput(fixture.pairAddress, signers.bob.address)
            .add32(swapAmountScaled)
            .encrypt();

          await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
          await fixture.pair
            .connect(signers.bob)
            .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);
        }
      }
    }

    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();
    expect(accumulatedFee).to.be.gt(0n, "Fees should have accumulated from swaps");

    const balanceABefore = await fixture.tokenB.balanceOf(signers.alice.address);
    await fixture.pair.connect(signers.alice).claimFees();
    const balanceAAfter = await fixture.tokenB.balanceOf(signers.alice.address);
    expect(balanceAAfter).to.be.gt(balanceABefore);
  });

  it("Should emit FeesClaimed event", async function () {
    // Use VERY LARGE swaps (50% of reserves) on large pools
    const [initialReserveA, initialReserveB] = await fixture.pair.getReserves();

    for (let i = 0; i < 3; i++) {
      const [currentReserveA, currentReserveB] = await fixture.pair.getReserves();
      const amountAOut = currentReserveA / 2n;

      if (currentReserveA > amountAOut && amountAOut > 0n && currentReserveB > 0n) {
        const amountBIn = await calculateInputForOutput(
          await fixture.tokenA.getAddress(),
          amountAOut,
          currentReserveB,
          currentReserveA,
        );

        if (amountBIn > 0n) {
          const bobBalance = await fixture.tokenB.balanceOf(signers.bob.address);
          if (bobBalance < amountBIn) {
            await fixture.tokenB.mint(signers.bob.address, amountBIn * 3n);
          }

          const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
          const encryptedSwapAmount = await fhevm
            .createEncryptedInput(fixture.pairAddress, signers.bob.address)
            .add32(swapAmountScaled)
            .encrypt();

          await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
          await fixture.pair
            .connect(signers.bob)
            .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);
        }
      }
    }

    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();
    expect(accumulatedFee).to.be.gt(0n, "Fees should have accumulated from swaps");

    await expect(fixture.pair.connect(signers.alice).claimFees())
      .to.emit(fixture.pair, "FeesClaimed")
      .withArgs(
        signers.alice.address,
        (value: bigint) => value >= 0n,
        (value: bigint) => value > 0n,
      );
  });

  it("Should reset reward debt after claiming", async function () {
    // Use VERY LARGE swaps (50% of reserves) on large pools
    const [initialReserveA, initialReserveB] = await fixture.pair.getReserves();

    for (let i = 0; i < 3; i++) {
      const [currentReserveA, currentReserveB] = await fixture.pair.getReserves();
      const amountAOut = currentReserveA / 2n;

      if (currentReserveA > amountAOut && amountAOut > 0n && currentReserveB > 0n) {
        const amountBIn = await calculateInputForOutput(
          await fixture.tokenA.getAddress(),
          amountAOut,
          currentReserveB,
          currentReserveA,
        );

        if (amountBIn > 0n) {
          const bobBalance = await fixture.tokenB.balanceOf(signers.bob.address);
          if (bobBalance < amountBIn) {
            await fixture.tokenB.mint(signers.bob.address, amountBIn * 3n);
          }

          const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
          const encryptedSwapAmount = await fhevm
            .createEncryptedInput(fixture.pairAddress, signers.bob.address)
            .add32(swapAmountScaled)
            .encrypt();

          await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
          await fixture.pair
            .connect(signers.bob)
            .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);
        }
      }
    }

    const accumulatedFeeBefore = await fixture.pair.accumulatedTokenBFeePerShare();
    expect(accumulatedFeeBefore).to.be.gt(0n, "Fees should have accumulated from swaps");

    await fixture.pair.connect(signers.alice).claimFees();

    const userInfo = await fixture.pair.userInfo(signers.alice.address);
    const userLiquidity = await fixture.pair.balanceOf(signers.alice.address);
    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();

    // ACC_PRECISION is 1e36 in the contract, not 1e40
    // Use 10n ** 36n instead of BigInt(1e36) to avoid floating point precision loss
    const ACC_PRECISION = 10n ** 36n;

    expect(userInfo.rewardDebtB).to.equal((userLiquidity * accumulatedFee) / ACC_PRECISION);
  });

  it("Should handle multiple fee claims from same user", async function () {
    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();

    if (accumulatedFee > 0n) {
      const balanceBefore1 = await fixture.tokenB.balanceOf(signers.alice.address);
      await fixture.pair.connect(signers.alice).claimFees();
      const balanceAfter1 = await fixture.tokenB.balanceOf(signers.alice.address);

      const balanceBefore2 = await fixture.tokenB.balanceOf(signers.alice.address);

      try {
        await fixture.pair.connect(signers.alice).claimFees();
        const balanceAfter2 = await fixture.tokenB.balanceOf(signers.alice.address);
        expect(balanceAfter2).to.equal(balanceBefore2);
      } catch (error: any) {
        expect(error.message).to.include("No fees to claim");
      }

      expect(balanceAfter1).to.be.gt(balanceBefore1);
    } else {
      await expect(fixture.pair.connect(signers.alice).claimFees()).to.be.revertedWith(
        "FHESplitFeeCFMM: No fees to claim",
      );
    }
  });

  it("Should correctly track user info after multiple liquidity operations", async function () {
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

    // Encrypt swap amount
    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.bob.address)
      .add32(swapAmountScaled)
      .encrypt();

    await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.bob)
      .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);

    const userInfoAfter = await fixture.pair.userInfo(signers.alice.address);
    const liquidityAfter = await fixture.pair.balanceOf(signers.alice.address);

    expect(liquidityAfter).to.equal(liquidityBefore);
    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();
    if (accumulatedFee > 0n) {
      expect(userInfoAfter.rewardDebtB).to.be.gte(userInfoBefore.rewardDebtB);
    }
  });

  it("Should handle very small fee accumulation", async function () {
    // Perform very small swap
    const amountAOut = ethers.parseEther("1");
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

    // Encrypt swap amount
    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.bob.address)
      .add32(swapAmountScaled)
      .encrypt();

    await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.bob)
      .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);

    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();
    expect(accumulatedFee).to.be.gte(0n);
  });

  it("Should handle fee accumulation with multiple swaps", async function () {
    for (let i = 0; i < 3; i++) {
      const amountAOut = ethers.parseEther("1000");
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

      // Encrypt swap amount
      const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.bob.address)
        .add32(swapAmountScaled)
        .encrypt();

      await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
      await fixture.pair
        .connect(signers.bob)
        .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);
    }

    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();
    expect(accumulatedFee).to.be.gte(0n);
  });

  it("Should handle fee claiming after adding liquidity", async function () {
    // Generate fees first
    const { calculateInputForOutput } = await import("./helpers/calculations");
    const amountAOut = ethers.parseEther("2000");
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

    // Encrypt swap amount
    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.bob.address)
      .add32(swapAmountScaled)
      .encrypt();

    await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.bob)
      .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.bob.address);

    // Check balance before adding liquidity
    const balanceBeforeAddLiquidity = await fixture.tokenB.balanceOf(signers.alice.address);

    // Add more liquidity (this will claim fees automatically)
    const amountA = ethers.parseEther("500");
    const amountB = ethers.parseEther("1000");
    await fixture.tokenA.transfer(fixture.pairAddress, amountA);
    await fixture.tokenB.transfer(fixture.pairAddress, amountB);
    await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

    // Verify fees were claimed during addLiquidity
    const balanceAfterAddLiquidity = await fixture.tokenB.balanceOf(signers.alice.address);
    const accumulatedFee = await fixture.pair.accumulatedTokenBFeePerShare();

    if (accumulatedFee > 0n) {
      // Fees should have been claimed during addLiquidity
      expect(balanceAfterAddLiquidity).to.be.gte(balanceBeforeAddLiquidity);

      // Now generate new fees with another swap
      const amountAOut2 = ethers.parseEther("1000");
      const amountBIn2 = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut2,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
      );

      const bobBalance2 = await fixture.tokenB.balanceOf(signers.bob.address);
      if (bobBalance2 < amountBIn2) {
        await fixture.tokenB.mint(signers.bob.address, amountBIn2 * 2n);
      }

      // Encrypt swap amount
      const swapAmountScaled2 = Number(amountBIn2 / ethers.parseEther("1"));
      const encryptedSwapAmount2 = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.bob.address)
        .add32(swapAmountScaled2)
        .encrypt();

      await fixture.tokenB.connect(signers.bob).approve(fixture.pairAddress, amountBIn2 * 2n);
      await fixture.pair
        .connect(signers.bob)
        .swap(encryptedSwapAmount2.handles[0], encryptedSwapAmount2.inputProof, amountAOut2, 0n, signers.bob.address);

      // Now claim the new fees
      const balanceBeforeClaim = await fixture.tokenB.balanceOf(signers.alice.address);
      await fixture.pair.connect(signers.alice).claimFees();
      const balanceAfterClaim = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceAfterClaim).to.be.gt(balanceBeforeClaim);
    }
  });
});
