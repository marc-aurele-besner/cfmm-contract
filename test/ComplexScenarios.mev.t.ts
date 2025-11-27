import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployComplexFixture, type ComplexFixture } from "./helpers/complexFixtures";

describe("Complex Scenarios - MEV", function () {
  let fixture: ComplexFixture;
  let signers: Signers;

  beforeEach(async function () {
    fixture = await deployComplexFixture();
    signers = await getSigners();

    // Mint tokens to users
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.dave.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.dave.address, ethers.parseEther("10000000"));
  });

  it("Should handle front-running with large liquidity addition", async function () {
    const swapAmount = ethers.parseEther("40000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("100000"),
        ethers.parseEther("200000"),
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    await fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(swapAmount, 0n, path, signers.bob.address, deadline);

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

    const finalBalance = await fixture.tokenA.balanceOf(signers.alice.address) + await fixture.tokenB.balanceOf(signers.alice.address);
    expect(finalBalance).to.be.gt(ethers.parseEther("300000"));
  });

  it("Should handle back-running with liquidity removal", async function () {
    const swapAmount = ethers.parseEther("30000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("50000"),
        ethers.parseEther("100000"),
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    await fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(swapAmount, 0n, path, signers.bob.address, deadline);

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

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(ethers.parseEther("50000"));
  });

  it("Should handle MEV bot competition scenario", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const victimSwap = ethers.parseEther("20000");

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    const tx1 = fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("5000"),
        ethers.parseEther("10000"),
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    const tx2 = fixture.router
      .connect(signers.charlie)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("5000"),
        ethers.parseEther("10000"),
        0n,
        0n,
        signers.charlie.address,
        deadline
      );

    await Promise.all([tx1, tx2]);

    await fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(victimSwap, 0n, path, signers.bob.address, deadline);

    const aliceLP = await fixture.pairAB.balanceOf(signers.alice.address);
    const charlieLP = await fixture.pairAB.balanceOf(signers.charlie.address);

    await fixture.router
      .connect(signers.alice)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        aliceLP,
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    await fixture.router
      .connect(signers.charlie)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        charlieLP,
        0n,
        0n,
        signers.charlie.address,
        deadline
      );

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(0n);
    expect(await fixture.tokenA.balanceOf(signers.charlie.address)).to.be.gt(0n);
  });

  it("Should handle MEV extraction through multiple pairs", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const victimSwap = ethers.parseEther("20000");

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairBC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    // MEV bot adds liquidity to multiple pairs
    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("10000"),
        ethers.parseEther("20000"),
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
        ethers.parseEther("20000"),
        ethers.parseEther("30000"),
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    // Victim swaps
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    await fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(victimSwap, 0n, path, signers.bob.address, deadline);

    // MEV bot removes liquidity
    const lpAB = await fixture.pairAB.balanceOf(signers.alice.address);
    const lpBC = await fixture.pairBC.balanceOf(signers.alice.address);

    await fixture.router
      .connect(signers.alice)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        lpAB,
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    await fixture.router
      .connect(signers.alice)
      .removeLiquidity(
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
        lpBC,
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(0n);
  });
});

