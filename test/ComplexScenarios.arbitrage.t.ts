import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployComplexFixture, type ComplexFixture } from "./helpers/complexFixtures";

describe("Complex Scenarios - Arbitrage", function () {
  let fixture: ComplexFixture;
  let signers: Signers;

  beforeEach(async function () {
    fixture = await deployComplexFixture();
    signers = await getSigners();

    // Mint tokens to users
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenD.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenC.mint(signers.bob.address, ethers.parseEther("10000000"));
  });

  it("Should detect and execute triangular arbitrage", async function () {
    const amountIn = ethers.parseEther("10000");

    const path1 = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const path2 = [await fixture.tokenB.getAddress(), await fixture.tokenC.getAddress()];
    const path3 = [await fixture.tokenC.getAddress(), await fixture.tokenA.getAddress()];

    const amounts1 = await fixture.router.getAmountsOut(amountIn, path1);
    const amounts2 = await fixture.router.getAmountsOut(amounts1[1], path2);
    const amounts3 = await fixture.router.getAmountsOut(amounts2[1], path3);

    if (amounts3[1] > amountIn) {
      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const balanceBefore = await fixture.tokenA.balanceOf(signers.alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path1, signers.alice.address, deadline);

      const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(balanceB, 0n, path2, signers.alice.address, deadline);

      const balanceC = await fixture.tokenC.balanceOf(signers.alice.address);
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(balanceC, 0n, path3, signers.alice.address, deadline);

      const balanceAfter = await fixture.tokenA.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    }
  });

  it("Should handle multi-hop arbitrage with liquidity changes", async function () {
    const amountIn = ethers.parseEther("50000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      await fixture.tokenD.getAddress(),
    ];

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.tokenB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const swapTx = fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);

    const liquidityTx = fixture.router
      .connect(signers.bob)
      .addLiquidity(
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
        ethers.parseEther("50000"),
        ethers.parseEther("100000"),
        0n,
        0n,
        signers.bob.address,
        deadline
      );

    await Promise.all([swapTx, liquidityTx]);

    const balanceD = await fixture.tokenD.balanceOf(signers.alice.address);
    expect(balanceD).to.be.gt(0n);
  });

  it("Should handle complex arbitrage with 4-hop path", async function () {
    // First create D-A pair if it doesn't exist
    const pairDAAddress = await fixture.factory.getPairAddress(
      await fixture.tokenD.getAddress(),
      await fixture.tokenA.getAddress()
    );

    if (pairDAAddress === ethers.ZeroAddress) {
      await fixture.factory.createPair(
        await fixture.tokenD.getAddress(),
        await fixture.tokenA.getAddress(),
        ethers.parseEther("40000"),
        ethers.parseEther("10000")
      );
      const newPairDAAddress = await fixture.factory.getPairAddress(
        await fixture.tokenD.getAddress(),
        await fixture.tokenA.getAddress()
      );
      await fixture.tokenD.transfer(newPairDAAddress, ethers.parseEther("40000"));
      await fixture.tokenA.transfer(newPairDAAddress, ethers.parseEther("10000"));
    }

    const amountIn = ethers.parseEther("5000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      await fixture.tokenD.getAddress(),
      await fixture.tokenA.getAddress(),
    ];

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenD.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);

    if (amounts[4] > amountIn) {
      const balanceBefore = await fixture.tokenA.balanceOf(signers.alice.address);

      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);

      const balanceAfter = await fixture.tokenA.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    }
  });

  it("Should handle arbitrage detection with multiple paths", async function () {
    const amountIn = ethers.parseEther("10000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const path1 = [await fixture.tokenA.getAddress(), await fixture.tokenC.getAddress()];
    const path2 = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
    ];

    const amounts1 = await fixture.router.getAmountsOut(amountIn, path1);
    const amounts2 = await fixture.router.getAmountsOut(amountIn, path2);

    // Choose the better path
    const betterPath = amounts2[2] > amounts1[1] ? path2 : path1;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, betterPath, signers.alice.address, deadline);

    expect(await fixture.tokenC.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle arbitrage with liquidity provision", async function () {
    const amountIn = ethers.parseEther("5000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairBC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    // Perform arbitrage swap
    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
    ];

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path, signers.alice.address, deadline);

    // Add liquidity to capture fees
    const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
    const balanceC = await fixture.tokenC.balanceOf(signers.alice.address);

    if (balanceB > 0n && balanceC > 0n) {
      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenB.getAddress(),
          await fixture.tokenC.getAddress(),
          balanceB,
          balanceC,
          0n,
          0n,
          signers.alice.address,
          deadline
        );

      expect(await fixture.pairBC.balanceOf(signers.alice.address)).to.be.gt(0n);
    }
  });
});

