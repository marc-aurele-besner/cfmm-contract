import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("FHESplitFeeCFMM - getAmountOut", function () {
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

  it("Should calculate correct output amount for tokenA input", async function () {
    const amountIn = ethers.parseEther("1000");
    const amountOut = await fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), amountIn);

    expect(amountOut).to.be.gt(0n);
    expect(amountOut).to.be.lt(ethers.parseEther("20000")); // Should be less than total reserve
  });

  it("Should calculate correct output amount for tokenB input", async function () {
    const amountIn = ethers.parseEther("2000");
    const amountOut = await fixture.pair.getAmountOut(await fixture.tokenB.getAddress(), amountIn);

    expect(amountOut).to.be.gt(0n);
    expect(amountOut).to.be.lt(ethers.parseEther("10000")); // Should be less than total reserve
  });

  it("Should revert for invalid token", async function () {
    const invalidToken = await (await ethers.getContractFactory("MockToken")).deploy("Invalid", "INV");
    const amountIn = ethers.parseEther("1000");

    await expect(fixture.pair.getAmountOut(await invalidToken.getAddress(), amountIn)).to.be.revertedWith(
      "FHESplitFeeCFMM: Invalid token",
    );
  });

  it("Should revert for zero input amount", async function () {
    await expect(fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), 0n)).to.be.revertedWith(
      "FHESplitFeeCFMM: Insufficient input amount",
    );
  });

  it("Should revert for zero address token", async function () {
    const amountIn = ethers.parseEther("1000");
    await expect(fixture.pair.getAmountOut(ethers.ZeroAddress, amountIn)).to.be.revertedWith(
      "FHESplitFeeCFMM: Invalid token",
    );
  });

  it("Should handle maximum uint256 values gracefully", async function () {
    const maxUint = ethers.MaxUint256;

    await expect(fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), maxUint)).to.be.reverted;
  });

  it("Should calculate decreasing output for increasing input", async function () {
    const amount1 = ethers.parseEther("1000");
    const amount2 = ethers.parseEther("2000");
    const amount3 = ethers.parseEther("3000");

    const out1 = await fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), amount1);
    const out2 = await fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), amount2);
    const out3 = await fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), amount3);

    // Output should increase with input, but rate should decrease (slippage)
    expect(out2).to.be.gt(out1);
    expect(out3).to.be.gt(out2);
    const rate1 = out1 / amount1;
    const rate2 = out2 / amount2;
    const rate3 = out3 / amount3;
    expect(rate1).to.be.gte(rate2);
    expect(rate2).to.be.gte(rate3);
  });

  it("Should handle getAmountOut with different reserve ratios", async function () {
    // Perform swap to change reserves
    const amountAOut = ethers.parseEther("5000");
    const { calculateInputForOutput } = await import("./helpers/calculations");
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

    // Encrypt swap amount
    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);
    await fixture.pair
      .connect(signers.alice)
      .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, signers.alice.address);

    // Now check getAmountOut with new reserves
    const amountIn = ethers.parseEther("1000");
    const amountOut = await fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), amountIn);
    expect(amountOut).to.be.gt(0n);
  });
});




