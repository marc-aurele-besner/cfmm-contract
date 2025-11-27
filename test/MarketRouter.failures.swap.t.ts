import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployRouterFixture, type RouterFixture } from "./helpers/routerFixtures";
import { MockToken__factory } from "../../types";

describe("MarketRouter - Swap Failures", function () {
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

  describe("swapExactTokensForTokens Failures", function () {
    it("Should revert with invalid path (single token)", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Invalid path");
    });

    it("Should revert with invalid path (empty array)", async function () {
      const amountIn = ethers.parseEther("1000");
      const path: string[] = [];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Invalid path");
    });

    it("Should revert with zero address recipient", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, ethers.ZeroAddress, deadline)
      ).to.be.revertedWith("MarketRouter: Invalid to");
    });

    it("Should revert with expired deadline", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Expired");
    });

    it("Should revert with insufficient output amount", async function () {
      const amountIn = ethers.parseEther("1000");
      const amountOutMin = ethers.parseEther("1000000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, amountOutMin, path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Insufficient output amount");
    });

    it("Should revert with non-existent pair in path", async function () {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
      const tokenD = await tokenFactory.deploy("TokenD", "TKD");

      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await tokenD.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Pair does not exist");
    });

    it("Should revert with insufficient token allowance", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline)
      ).to.be.reverted;
    });

    it("Should revert with insufficient token balance", async function () {
      const amountIn = ethers.parseEther("1000000000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline)
      ).to.be.reverted;
    });
  });

  describe("swapTokensForExactTokens Failures", function () {
    it("Should revert with invalid path", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(amountOut, ethers.parseEther("10000"), path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Invalid path");
    });

    it("Should revert with zero address recipient", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(amountOut, ethers.parseEther("10000"), path, ethers.ZeroAddress, deadline)
      ).to.be.revertedWith("MarketRouter: Invalid to");
    });

    it("Should revert with expired deadline", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(amountOut, ethers.parseEther("10000"), path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Expired");
    });

    it("Should revert with excessive input amount", async function () {
      const amountOut = ethers.parseEther("10000");
      const amountInMax = ethers.parseEther("1");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(amountOut, amountInMax, path, signers.alice.address, deadline)
      ).to.be.reverted;
    });

    it("Should revert with non-existent pair in path", async function () {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
      const tokenD = await tokenFactory.deploy("TokenD", "TKD");

      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await tokenD.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(amountOut, ethers.parseEther("10000"), path, signers.alice.address, deadline)
      ).to.be.revertedWith("MarketRouter: Pair does not exist");
    });
  });

  describe("getAmountsOut Failures", function () {
    it("Should revert for invalid path", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];

      await expect(fixture.router.getAmountsOut(amountIn, path)).to.be.revertedWith("MarketRouter: Invalid path");
    });

    it("Should revert for zero amounts in calculations", async function () {
      const amountIn = 0n;
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

      await expect(fixture.router.getAmountsOut(amountIn, path)).to.be.revertedWith(
        "SplitFeeCFMM: Insufficient input amount"
      );
    });
  });

  describe("getAmountsIn Failures", function () {
    it("Should revert for invalid path", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];

      await expect(fixture.router.getAmountsIn(amountOut, path)).to.be.revertedWith("MarketRouter: Invalid path");
    });
  });
});




