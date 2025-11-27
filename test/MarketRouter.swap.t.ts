import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployRouterFixture, type RouterFixture } from "./helpers/routerFixtures";

describe("MarketRouter - Swap", function () {
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
    await fixture.tokenA.mint(signers.bob.address, ethers.parseEther("100000"));
    await fixture.tokenB.mint(signers.bob.address, ethers.parseEther("100000"));
  });

  describe("swapExactTokensForTokens", function () {
    it("Should swap exact tokens for tokens (single hop)", async function () {
      const amountIn = ethers.parseEther("1000");
      const amountOutMin = ethers.parseEther("1");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const balanceBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, amountOutMin, path, signers.alice.address, deadline);

      const balanceAfter = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should swap exact tokens for tokens (multi-hop)", async function () {
      const amountIn = ethers.parseEther("1000");
      const amountOutMin = ethers.parseEther("1");
      const path = [
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
      ];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const balanceBefore = await fixture.tokenC.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, amountOutMin, path, signers.alice.address, deadline);

      const balanceAfter = await fixture.tokenC.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should handle multi-hop swap with optimal path", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
      ];

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amounts = await fixture.router.getAmountsOut(amountIn, path);

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);

      const balanceC = await fixture.tokenC.balanceOf(signers.alice.address);
      expect(balanceC).to.be.gt(0n);
      expect(balanceC).to.be.gte(amounts[2] - (amounts[2] * 1n) / 1000n);
    });

    it("Should handle concurrent swaps through same pair", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const tx1 = fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);

      const tx2 = fixture.router
        .connect(signers.bob)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.bob.address, deadline);

      await Promise.all([tx1, tx2]);

      expect(await fixture.tokenB.balanceOf(signers.alice.address)).to.be.gt(0n);
      expect(await fixture.tokenB.balanceOf(signers.bob.address)).to.be.gt(0n);
    });

    it("Should handle swap with minimum slippage tolerance", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const amounts = await fixture.router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] - (amounts[1] * 1n) / 100n; // 1% slippage tolerance

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, amountOutMin, path, signers.alice.address, deadline);

      const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceB).to.be.gte(amountOutMin);
    });
  });

  describe("swapTokensForExactTokens", function () {
    it("Should swap tokens for exact tokens (single hop)", async function () {
      const amountOut = ethers.parseEther("1000");
      const amountInMax = ethers.parseEther("10000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const balanceBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .swapTokensForExactTokens(amountOut, amountInMax, path, signers.alice.address, deadline);

      const balanceAfter = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should handle swap with exact minimum output", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const amounts = await fixture.router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] - (amounts[1] * 1n) / 100n; // 1% slippage

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, amountOutMin, path, signers.alice.address, deadline);

      const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceB).to.be.gte(amountOutMin);
    });

    it("Should handle reverse swap path", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const balanceBefore = await fixture.tokenA.balanceOf(signers.alice.address);
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);
      const balanceAfter = await fixture.tokenA.balanceOf(signers.alice.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });
});

