import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployComplexFixture, type ComplexFixture } from "./helpers/complexFixtures";

describe("Complex Scenarios - Concurrent Operations", function () {
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
    await fixture.tokenC.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenC.mint(signers.charlie.address, ethers.parseEther("10000000"));
  });

  it("Should handle multiple users adding liquidity in same block", async function () {
    const amountA = ethers.parseEther("10000");
    const amountB = ethers.parseEther("20000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const [reserveABefore, reserveBBefore] = await fixture.pairAB.getReserves();
    const totalSupplyBefore = await fixture.pairAB.totalSupply();

    const tx1 = fixture.router
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

    const tx2 = fixture.router
      .connect(signers.bob)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        amountA,
        amountB,
        0n,
        0n,
        signers.bob.address,
        deadline
      );

    const tx3 = fixture.router
      .connect(signers.charlie)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        amountA,
        amountB,
        0n,
        0n,
        signers.charlie.address,
        deadline
      );

    await Promise.all([tx1, tx2, tx3]);

    const [reserveAAfter, reserveBAfter] = await fixture.pairAB.getReserves();
    expect(reserveAAfter).to.be.gt(reserveABefore);
    expect(reserveBAfter).to.be.gt(reserveBBefore);

    expect(await fixture.pairAB.balanceOf(signers.alice.address)).to.be.gt(0n);
    expect(await fixture.pairAB.balanceOf(signers.bob.address)).to.be.gt(0n);
    expect(await fixture.pairAB.balanceOf(signers.charlie.address)).to.be.gt(0n);
  });

  it("Should handle adding and removing liquidity in same block by different users", async function () {
    const addAmountA = ethers.parseEther("10000");
    const addAmountB = ethers.parseEther("20000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        addAmountA,
        addAmountB,
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    const aliceLP = await fixture.pairAB.balanceOf(signers.alice.address);

    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router
      .connect(signers.bob)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        addAmountA,
        addAmountB,
        0n,
        0n,
        signers.bob.address,
        deadline
      );

    await fixture.pairAB.connect(signers.alice).transfer(signers.charlie.address, aliceLP / 2n);
    await fixture.pairAB.connect(signers.charlie).approve(await fixture.router.getAddress(), aliceLP / 2n);

    const [reserveBefore, reserveBBefore] = await fixture.pairAB.getReserves();

    await fixture.router
      .connect(signers.charlie)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        aliceLP / 2n,
        0n,
        0n,
        signers.charlie.address,
        deadline
      );

    const [reserveAfter, reserveBAfter] = await fixture.pairAB.getReserves();

    expect(reserveAfter).to.be.lt(reserveBefore);
    expect(reserveBAfter).to.be.lt(reserveBBefore);
  });

  it("Should handle rapid add/remove cycles by same user", async function () {
    const amountA = ethers.parseEther("10000");
    const amountB = ethers.parseEther("20000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    for (let i = 0; i < 5; i++) {
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
    }

    const finalBalanceA = await fixture.tokenA.balanceOf(signers.alice.address);
    const finalBalanceB = await fixture.tokenB.balanceOf(signers.alice.address);
    expect(finalBalanceA).to.be.gt(0n);
    expect(finalBalanceB).to.be.gt(0n);
  });

  it("Should handle liquidity provision during high volatility", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const largeSwap = ethers.parseEther("30000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    await fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(largeSwap, 0n, path, signers.bob.address, deadline);

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

    const lpBalance = await fixture.pairAB.balanceOf(signers.alice.address);
    expect(lpBalance).to.be.gt(0n);
  });

  it("Should handle concurrent swaps and liquidity operations", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const swapAmount = ethers.parseEther("5000");

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Concurrent operations
    const swapTx = fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(swapAmount, 0n, path, signers.bob.address, deadline);

    const liquidityTx = fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("2000"),
        ethers.parseEther("4000"),
        0n,
        0n,
        signers.alice.address,
        deadline
      );

    await Promise.all([swapTx, liquidityTx]);

    expect(await fixture.tokenB.balanceOf(signers.bob.address)).to.be.gt(0n);
    expect(await fixture.pairAB.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle multiple users removing liquidity concurrently", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Setup: Both users add liquidity
    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

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

    await fixture.router
      .connect(signers.bob)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
        0n,
        0n,
        signers.bob.address,
        deadline
      );

    // Both remove liquidity concurrently
    const aliceLP = await fixture.pairAB.balanceOf(signers.alice.address);
    const bobLP = await fixture.pairAB.balanceOf(signers.bob.address);

    const tx1 = fixture.router
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

    const tx2 = fixture.router
      .connect(signers.bob)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        bobLP,
        0n,
        0n,
        signers.bob.address,
        deadline
      );

    await Promise.all([tx1, tx2]);

    expect(await fixture.pairAB.balanceOf(signers.alice.address)).to.equal(0n);
    expect(await fixture.pairAB.balanceOf(signers.bob.address)).to.equal(0n);
  });
});

