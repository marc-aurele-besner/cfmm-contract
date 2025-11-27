import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployRouterFixture, type RouterFixture } from "./helpers/routerFixtures";

describe("MarketRouter - Liquidity", function () {
  let signers: Signers;
  let fixture: RouterFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployRouterFixture();
    
    // Mint tokens to users
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenB.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("100000"));
  });

  describe("addLiquidity", function () {
    it("Should add liquidity to a pair", async function () {
      const amountADesired = ethers.parseEther("1000");
      const amountBDesired = ethers.parseEther("2000");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const lpBalanceBefore = await fixture.pairAB.balanceOf(signers.alice.address);

      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          amountADesired,
          amountBDesired,
          0n,
          0n,
          signers.alice.address,
          deadline
        );

      const lpBalanceAfter = await fixture.pairAB.balanceOf(signers.alice.address);
      expect(lpBalanceAfter).to.be.gt(lpBalanceBefore);
    });

    it("Should handle adding liquidity with exact proportional amounts", async function () {
      const [reserveA, reserveB] = await fixture.pairAB.getReserves();
      const ratio = reserveB / reserveA;

      const amountA = ethers.parseEther("5000");
      const amountB = amountA * ratio;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          amountA,
          amountB,
          0n,
          0n,
          signers.alice.address,
          deadline
        );

      const lpBalance = await fixture.pairAB.balanceOf(signers.alice.address);
      expect(lpBalance).to.be.gt(0n);
    });

    it("Should handle router quote calculation", async function () {
      const [reserveA, reserveB] = await fixture.pairAB.getReserves();
      const amountA = ethers.parseEther("1000");

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const expectedAmountB = (amountA * reserveB) / reserveA;

      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          amountA,
          expectedAmountB * 2n,
          amountA,
          expectedAmountB,
          signers.alice.address,
          deadline
        );

      const lpBalance = await fixture.pairAB.balanceOf(signers.alice.address);
      expect(lpBalance).to.be.gt(0n);
    });
  });

  describe("removeLiquidity", function () {
    beforeEach(async function () {
      // Add liquidity first
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          ethers.parseEther("1000"),
          ethers.parseEther("2000"),
          0n,
          0n,
          signers.alice.address,
          deadline
        );
    });

    it("Should remove liquidity from a pair", async function () {
      const liquidity = await fixture.pairAB.balanceOf(signers.alice.address);
      const amountAMin = 0n;
      const amountBMin = 0n;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const balanceABefore = await fixture.tokenA.balanceOf(signers.alice.address);
      const balanceBBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.router
        .connect(signers.alice)
        .removeLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          liquidity,
          amountAMin,
          amountBMin,
          signers.alice.address,
          deadline
        );

      const balanceAAfter = await fixture.tokenA.balanceOf(signers.alice.address);
      const balanceBAfter = await fixture.tokenB.balanceOf(signers.alice.address);

      expect(balanceAAfter).to.be.gt(balanceABefore);
      expect(balanceBAfter).to.be.gt(balanceBBefore);
    });

    it("Should handle removing liquidity with exact LP amount", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const lpBalance = await fixture.pairAB.balanceOf(signers.alice.address);

      await fixture.router
        .connect(signers.alice)
        .removeLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          lpBalance,
          0n,
          0n,
          signers.alice.address,
          deadline
        );

      expect(await fixture.pairAB.balanceOf(signers.alice.address)).to.equal(0n);
    });

    it("Should handle adding liquidity with minimum amounts", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amountADesired = ethers.parseEther("1000");
      const amountBDesired = ethers.parseEther("2000");

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const lpBefore = await fixture.pairAB.balanceOf(signers.alice.address);

      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          amountADesired,
          amountBDesired,
          amountADesired - ethers.parseEther("100"),
          amountBDesired - ethers.parseEther("200"),
          signers.alice.address,
          deadline
        );

      const lpAfter = await fixture.pairAB.balanceOf(signers.alice.address);
      expect(lpAfter).to.be.gt(lpBefore);
    });

    it("Should handle partial liquidity removal", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          ethers.parseEther("1000"),
          ethers.parseEther("2000"),
          0n,
          0n,
          signers.alice.address,
          deadline
        );

      const totalLP = await fixture.pairAB.balanceOf(signers.alice.address);
      const removeAmount = totalLP / 2n;

      const balanceABefore = await fixture.tokenA.balanceOf(signers.alice.address);
      const balanceBBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.router
        .connect(signers.alice)
        .removeLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          removeAmount,
          0n,
          0n,
          signers.alice.address,
          deadline
        );

      const balanceAAfter = await fixture.tokenA.balanceOf(signers.alice.address);
      const balanceBAfter = await fixture.tokenB.balanceOf(signers.alice.address);

      expect(balanceAAfter).to.be.gt(balanceABefore);
      expect(balanceBAfter).to.be.gt(balanceBBefore);
      expect(await fixture.pairAB.balanceOf(signers.alice.address)).to.equal(totalLP - removeAmount);
    });
  });
});

