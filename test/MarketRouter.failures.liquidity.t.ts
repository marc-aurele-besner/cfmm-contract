import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployRouterFixture, type RouterFixture } from "./helpers/routerFixtures";

describe("MarketRouter - Liquidity Failures", function () {
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

  describe("addLiquidity Failures", function () {
    it("Should revert with identical token addresses", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .addLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenA.getAddress(),
            ethers.parseEther("1000"),
            ethers.parseEther("2000"),
            0n,
            0n,
            signers.alice.address,
            deadline
          )
      ).to.be.revertedWith("MarketRouter: Identical addresses");
    });

    it("Should revert with zero address token", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .addLiquidity(
            ethers.ZeroAddress,
            await fixture.tokenB.getAddress(),
            ethers.parseEther("1000"),
            ethers.parseEther("2000"),
            0n,
            0n,
            signers.alice.address,
            deadline
          )
      ).to.be.revertedWith("MarketRouter: Pair does not exist");
    });

    it("Should revert with expired deadline", async function () {
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        fixture.router
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
          )
      ).to.be.revertedWith("MarketRouter: Expired");
    });
  });

  describe("removeLiquidity Failures", function () {
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

    it("Should revert with zero address token", async function () {
      const liquidity = await fixture.pairAB.balanceOf(signers.alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .removeLiquidity(
            ethers.ZeroAddress,
            await fixture.tokenB.getAddress(),
            liquidity,
            0n,
            0n,
            signers.alice.address,
            deadline
          )
      ).to.be.revertedWith("MarketRouter: Pair does not exist");
    });

    it("Should revert with expired deadline", async function () {
      const liquidity = await fixture.pairAB.balanceOf(signers.alice.address);
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .removeLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenB.getAddress(),
            liquidity,
            0n,
            0n,
            signers.alice.address,
            deadline
          )
      ).to.be.revertedWith("MarketRouter: Expired");
    });
  });
});

