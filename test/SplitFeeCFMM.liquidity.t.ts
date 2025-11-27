import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, deployBasicFixture, type Signers, type BasicFixture } from "./helpers/fixtures";

describe("SplitFeeCFMM - Liquidity", function () {
  let signers: Signers;
  let fixture: BasicFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployBasicFixture();
  });

  describe("Add Liquidity", function () {
    it("Should add liquidity and mint LP tokens", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      const balanceBefore = await fixture.pair.balanceOf(signers.alice.address);

      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

      const balanceAfter = await fixture.pair.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);

      const [reserveA, reserveB] = await fixture.pair.getReserves();
      expect(reserveA).to.equal(ethers.parseEther("11000"));
      expect(reserveB).to.equal(ethers.parseEther("22000"));
    });

    it("Should emit Mint event", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address))
        .to.emit(fixture.pair, "Mint")
        .withArgs(signers.alice.address, amountA, amountB);
    });

    it("Should handle multiple liquidity providers", async function () {
      const amountA1 = ethers.parseEther("1000");
      const amountB1 = ethers.parseEther("2000");

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA1);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB1);
      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

      const amountA2 = ethers.parseEther("500");
      const amountB2 = ethers.parseEther("1000");

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA2);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB2);
      await fixture.pair.connect(signers.bob).addLiquidity(signers.bob.address);

      const aliceBalance = await fixture.pair.balanceOf(signers.alice.address);
      const bobBalance = await fixture.pair.balanceOf(signers.bob.address);

      expect(aliceBalance).to.be.gt(0n);
      expect(bobBalance).to.be.gt(0n);
    });

    it("Should handle adding liquidity after large swap", async function () {
      // Perform large swap first
      const largeSwap = ethers.parseEther("5000");
      const { calculateInputForOutput } = await import("./helpers/calculations");
      const [reserveA, reserveB] = await fixture.pair.getReserves();
      const amountBIn = await calculateInputForOutput(await fixture.tokenA.getAddress(), largeSwap, reserveB, reserveA);

      const balance = await fixture.tokenB.balanceOf(signers.alice.address);
      if (balance < amountBIn) {
        await fixture.tokenB.mint(signers.alice.address, amountBIn * 2n);
      }

      await fixture.tokenB.connect(signers.alice).approve(await fixture.pair.getAddress(), amountBIn * 2n);
      await fixture.pair.connect(signers.alice).swap(largeSwap, 0n, signers.alice.address);

      // Add liquidity after price change
      const [reserveAAfter, reserveBAfter] = await fixture.pair.getReserves();
      const amountA = ethers.parseEther("1000");
      const amountB = (amountA * reserveBAfter) / reserveAAfter;

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      const lpBefore = await fixture.pair.balanceOf(signers.alice.address);
      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);
      const lpAfter = await fixture.pair.balanceOf(signers.alice.address);

      expect(lpAfter).to.be.gt(lpBefore);
    });

    it("Should handle adding liquidity with very small amounts", async function () {
      const amountA = ethers.parseEther("0.001");
      const amountB = ethers.parseEther("0.002");

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

      const lpBalance = await fixture.pair.balanceOf(signers.alice.address);
      expect(lpBalance).to.be.gt(0n);
    });
  });

  describe("Remove Liquidity", function () {
    beforeEach(async function () {
      // Add liquidity first
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);
      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);
    });

    it("Should remove all liquidity", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      expect(liquidity).to.be.gt(0n);

      const reserveABefore = await fixture.pair.getReserveA();
      const reserveBBefore = await fixture.pair.getReserveB();

      await fixture.pair.connect(signers.alice).removeLiquidity(signers.alice.address);

      const balanceAfter = await fixture.pair.balanceOf(signers.alice.address);
      expect(balanceAfter).to.equal(0n);

      const reserveAAfter = await fixture.pair.getReserveA();
      const reserveBAfter = await fixture.pair.getReserveB();

      expect(reserveAAfter).to.be.lt(reserveABefore);
      expect(reserveBAfter).to.be.lt(reserveBBefore);
    });

    it("Should remove exact liquidity", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      const removeAmount = liquidity / 2n;

      await fixture.pair.connect(signers.alice).removeExactLiquidity(removeAmount, signers.alice.address);

      const balanceAfter = await fixture.pair.balanceOf(signers.alice.address);
      expect(balanceAfter).to.equal(liquidity - removeAmount);
    });

    it("Should emit Burn event", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);

      await expect(fixture.pair.connect(signers.alice).removeLiquidity(signers.alice.address)).to.emit(
        fixture.pair,
        "Burn",
      );
    });

    it("Should handle partial liquidity removal with fee claiming", async function () {
      const totalLiquidity = await fixture.pair.balanceOf(signers.alice.address);

      // Generate fees through swaps
      const { calculateInputForOutput } = await import("./helpers/calculations");
      for (let i = 0; i < 3; i++) {
        const amountAOut = ethers.parseEther("500");
        const [reserveA, reserveB] = await fixture.pair.getReserves();
        const amountBIn = await calculateInputForOutput(
          await fixture.tokenA.getAddress(),
          amountAOut,
          reserveB,
          reserveA,
        );

        const balance = await fixture.tokenB.balanceOf(signers.bob.address);
        if (balance < amountBIn) {
          await fixture.tokenB.mint(signers.bob.address, amountBIn * 2n);
        }

        await fixture.tokenB.connect(signers.bob).approve(await fixture.pair.getAddress(), amountBIn * 2n);
        await fixture.pair.connect(signers.bob).swap(amountAOut, 0n, signers.bob.address);
      }

      // Remove half liquidity
      const liquidityToRemove = totalLiquidity / 2n;
      const balanceABefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.pair.connect(signers.alice).removeExactLiquidity(liquidityToRemove, signers.alice.address);

      const balanceAAfter = await fixture.tokenB.balanceOf(signers.alice.address);

      // Should have received tokens back
      expect(balanceAAfter).to.be.gt(balanceABefore);

      // Remaining liquidity should be correct
      const remainingLiquidity = await fixture.pair.balanceOf(signers.alice.address);
      expect(remainingLiquidity).to.equal(totalLiquidity - liquidityToRemove);
    });

    it("Should handle removing very small liquidity amounts", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      const smallAmount = liquidity / 1000n; // Remove 0.1% of liquidity

      if (smallAmount > 0n) {
        await fixture.pair.connect(signers.alice).removeExactLiquidity(smallAmount, signers.alice.address);
      }
    });

    it("Should handle removing liquidity after price change", async function () {
      // First perform a swap to change price
      const amountAOut = ethers.parseEther("1000");
      const { calculateInputForOutput } = await import("./helpers/calculations");
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

      await fixture.tokenB.connect(signers.bob).approve(await fixture.pair.getAddress(), amountBIn * 2n);
      await fixture.pair.connect(signers.bob).swap(amountAOut, 0n, signers.bob.address);

      // Now remove liquidity
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      if (liquidity > 0n) {
        const balanceABefore = await fixture.tokenA.balanceOf(signers.alice.address);
        const balanceBBefore = await fixture.tokenB.balanceOf(signers.alice.address);

        await fixture.pair.connect(signers.alice).removeExactLiquidity(liquidity / 2n, signers.alice.address);

        const balanceAAfter = await fixture.tokenA.balanceOf(signers.alice.address);
        const balanceBAfter = await fixture.tokenB.balanceOf(signers.alice.address);

        expect(balanceAAfter).to.be.gt(balanceABefore);
        expect(balanceBAfter).to.be.gt(balanceBBefore);
      }
    });

    it("Should handle adding liquidity with imbalanced ratios", async function () {
      const amountA = ethers.parseEther("5000");
      const amountB = ethers.parseEther("5000"); // Different ratio than initial 1:2

      await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
      await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

      const lpBefore = await fixture.pair.balanceOf(signers.alice.address);
      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);
      const lpAfter = await fixture.pair.balanceOf(signers.alice.address);

      expect(lpAfter).to.be.gt(lpBefore);
    });
  });
});
