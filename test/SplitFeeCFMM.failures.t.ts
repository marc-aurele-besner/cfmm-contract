import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, deployBasicFixture, type Signers, type BasicFixture } from "./helpers/fixtures";
import { calculateInputForOutput } from "./helpers/calculations";

describe("SplitFeeCFMM - Failures", function () {
  let signers: Signers;
  let fixture: BasicFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployBasicFixture();
  });

  describe("Swap Failures", function () {
    it("Should revert swap with zero output", async function () {
      await expect(fixture.pair.connect(signers.alice).swap(0n, 0n, signers.alice.address)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient output amount",
      );
    });

    it("Should revert swap with both outputs", async function () {
      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(ethers.parseEther("100"), ethers.parseEther("200"), signers.alice.address),
      ).to.be.revertedWith("SplitFeeCFMM: Cannot swap both tokens");
    });

    it("Should revert swap with invalid recipient (tokenA address)", async function () {
      const amountAOut = ethers.parseEther("100");
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
      );

      await fixture.tokenB.connect(signers.alice).approve(await fixture.pair.getAddress(), amountBIn * 2n);

      await expect(
        fixture.pair.connect(signers.alice).swap(amountAOut, 0n, await fixture.tokenA.getAddress()),
      ).to.be.revertedWith("SplitFeeCFMM: Invalid recipient");
    });

    it("Should revert swap with invalid recipient (tokenB address)", async function () {
      const amountBOut = ethers.parseEther("200");
      const amountAIn = await calculateInputForOutput(
        await fixture.tokenB.getAddress(),
        amountBOut,
        await fixture.pair.getReserveA(),
        await fixture.pair.getReserveB(),
      );

      await fixture.tokenA.connect(signers.alice).approve(await fixture.pair.getAddress(), amountAIn * 2n);

      await expect(
        fixture.pair.connect(signers.alice).swap(0n, amountBOut, await fixture.tokenB.getAddress()),
      ).to.be.revertedWith("SplitFeeCFMM: Invalid recipient");
    });

    it("Should revert swap with insufficient reserves (amountAOut too large)", async function () {
      const [reserveA] = await fixture.pair.getReserves();
      const amountAOut = reserveA + ethers.parseEther("1");

      await expect(fixture.pair.connect(signers.alice).swap(amountAOut, 0n, signers.alice.address)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient reserveA",
      );
    });

    it("Should revert swap with insufficient reserves (amountBOut too large)", async function () {
      const [, reserveB] = await fixture.pair.getReserves();
      const amountBOut = reserveB + ethers.parseEther("1");

      await expect(fixture.pair.connect(signers.alice).swap(0n, amountBOut, signers.alice.address)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient reserveB",
      );
    });

    it("Should revert swap with insufficient token balance", async function () {
      const amountAOut = ethers.parseEther("100");

      await expect(fixture.pair.connect(signers.alice).swap(amountAOut, 0n, signers.alice.address)).to.be.reverted;
    });

    it("Should revert swap with zero address recipient", async function () {
      const amountAOut = ethers.parseEther("100");
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
      );

      await fixture.tokenB.connect(signers.alice).approve(await fixture.pair.getAddress(), amountBIn * 2n);

      await expect(fixture.pair.connect(signers.alice).swap(amountAOut, 0n, ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("Add Liquidity Failures", function () {
    it("Should revert add liquidity with zero tokenA amount", async function () {
      const amountB = ethers.parseEther("2000");
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient amounts",
      );
    });

    it("Should revert add liquidity with zero tokenB amount", async function () {
      const amountA = ethers.parseEther("1000");
      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient amounts",
      );
    });

    it("Should revert add liquidity with zero address recipient", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("Remove Liquidity Failures", function () {
    it("Should revert remove liquidity with zero balance", async function () {
      await expect(fixture.pair.connect(signers.bob).removeLiquidity(signers.bob.address)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient liquidity",
      );
    });

    it("Should revert removeExactLiquidity with zero amount", async function () {
      await expect(
        fixture.pair.connect(signers.alice).removeExactLiquidity(0n, signers.alice.address),
      ).to.be.revertedWith("SplitFeeCFMM: Insufficient liquidity");
    });

    it("Should revert removeExactLiquidity with insufficient balance", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      const excessAmount = liquidity + ethers.parseEther("1");

      await expect(
        fixture.pair.connect(signers.alice).removeExactLiquidity(excessAmount, signers.alice.address),
      ).to.be.revertedWith("SplitFeeCFMM: Insufficient balance");
    });

    it("Should revert remove liquidity with zero address recipient", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      if (liquidity > 0n) {
        await expect(fixture.pair.connect(signers.alice).removeExactLiquidity(liquidity, ethers.ZeroAddress)).to.be
          .reverted;
      }
    });
  });

  describe("Claim Fees Failures", function () {
    it("Should revert claim fees with no liquidity", async function () {
      await expect(fixture.pair.connect(signers.bob).claimFees()).to.be.revertedWith(
        "SplitFeeCFMM: No liquidity to claim fees from",
      );
    });

    it("Should revert claim fees when no fees available", async function () {
      // Add liquidity but don't perform any swaps to generate fees
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);
      await fixture.pair.connect(signers.bob).addLiquidity(signers.bob.address);

      await expect(fixture.pair.connect(signers.bob).claimFees()).to.be.revertedWith("SplitFeeCFMM: No fees to claim");
    });
  });

  describe("getAmountOut Failures", function () {
    it("Should revert for invalid token", async function () {
      const invalidToken = await (await ethers.getContractFactory("MockToken")).deploy("Invalid", "INV");
      const amountIn = ethers.parseEther("1000");

      await expect(fixture.pair.getAmountOut(await invalidToken.getAddress(), amountIn)).to.be.revertedWith(
        "SplitFeeCFMM: Invalid token",
      );
    });

    it("Should revert for zero input amount", async function () {
      await expect(fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), 0n)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient input amount",
      );
    });

    it("Should revert for zero address token", async function () {
      const amountIn = ethers.parseEther("1000");
      await expect(fixture.pair.getAmountOut(ethers.ZeroAddress, amountIn)).to.be.revertedWith(
        "SplitFeeCFMM: Invalid token",
      );
    });
  });
});




