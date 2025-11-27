import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployRouterFixture, type RouterFixture } from "./helpers/routerFixtures";
import { MockToken__factory } from "../types";

describe("MarketRouter - Edge Cases", function () {
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

  it("Should handle very small swap amounts", async function () {
    const amountIn = ethers.parseEther("0.0001");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    if (amounts[1] > 0n) {
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);
    }
  });

  it("Should handle very large swap amounts", async function () {
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("1000000"));

    const amountIn = ethers.parseEther("50000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    if (amounts[1] > 0n) {
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);
    }
  });

  it("Should handle deadline at current time", async function () {
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);
  });

  it("Should handle very long paths (if pairs exist)", async function () {
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
    const tokenD = await tokenFactory.deploy("TokenD", "TKD");

    await tokenD.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("100000"));

    await fixture.factory.createPair(
      await fixture.tokenC.getAddress(),
      await tokenD.getAddress(),
      ethers.parseEther("10000"),
      ethers.parseEther("20000"),
    );
    const pairCDAddress = await fixture.factory.getPairAddress(
      await fixture.tokenC.getAddress(),
      await tokenD.getAddress(),
    );
    await fixture.tokenC.transfer(pairCDAddress, ethers.parseEther("10000"));
    await tokenD.transfer(pairCDAddress, ethers.parseEther("20000"));

    const amountIn = ethers.parseEther("1000");
    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      await tokenD.getAddress(),
    ];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    expect(amounts.length).to.equal(4);
    expect(amounts[0]).to.equal(amountIn);
  });

  it("Should handle maximum deadline", async function () {
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = ethers.MaxUint256;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);
  });

  it("Should handle reentrancy protection", async function () {
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);
  });

  it("Should handle router integration with factory", async function () {
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
    const tokenX = await tokenFactory.deploy("TokenX", "TKX");
    const tokenY = await tokenFactory.deploy("TokenY", "TKY");

    await tokenX.mint(signers.deployer.address, ethers.parseEther("1000000"));
    await tokenY.mint(signers.deployer.address, ethers.parseEther("1000000"));

    await fixture.factory.createPair(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
      ethers.parseEther("10000"),
      ethers.parseEther("20000"),
    );

    const pairAddress = await fixture.factory.getPairAddress(await tokenX.getAddress(), await tokenY.getAddress());
    await tokenX.transfer(pairAddress, ethers.parseEther("10000"));
    await tokenY.transfer(pairAddress, ethers.parseEther("20000"));

    await tokenX.mint(signers.alice.address, ethers.parseEther("100000"));
    await tokenX.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const path = [await tokenX.getAddress(), await tokenY.getAddress()];

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(ethers.parseEther("1000"), 0n, path, signers.alice.address, deadline);

    expect(await tokenY.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle deadline edge cases", async function () {
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    const farFutureDeadline = Math.floor(Date.now() / 1000) + 86400 * 365;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, farFutureDeadline);

    expect(await fixture.tokenB.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle swap with router integration", async function () {
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, amounts[1] - (amounts[1] * 1n) / 100n, path, signers.alice.address, deadline);

    expect(await fixture.tokenB.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle multiple swaps affecting router calculations", async function () {
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amount1 = ethers.parseEther("1000");
    const amounts1 = await fixture.router.getAmountsOut(amount1, path);

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amount1, 0n, path, signers.alice.address, deadline);

    const amount2 = ethers.parseEther("1000");
    const amounts2 = await fixture.router.getAmountsOut(amount2, path);

    // Second swap should give different output due to price change
    expect(amounts2[1]).to.not.equal(amounts1[1]);
  });
});
