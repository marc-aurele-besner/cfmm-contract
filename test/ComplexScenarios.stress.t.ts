import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployComplexFixture, type ComplexFixture } from "./helpers/complexFixtures";

describe("Complex Scenarios - Stress Tests", function () {
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

  it("Should handle many operations in sequence", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    for (let i = 0; i < 10; i++) {
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

      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(ethers.parseEther("500"), 0n, path, signers.alice.address, deadline);

      const lpBalance = await fixture.pairAB.balanceOf(signers.alice.address);
      if (lpBalance > 0n) {
        await fixture.router
          .connect(signers.alice)
          .removeLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenB.getAddress(),
            lpBalance / 2n,
            0n,
            0n,
            signers.alice.address,
            deadline
          );
      }
    }

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
  });

  it("Should handle extreme price movements", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const largeSwap = ethers.parseEther("80000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(largeSwap, 0n, path, signers.alice.address, deadline);

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);

    const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
    const reversePath = [await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress()];

    await fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(balanceB / 2n, 0n, reversePath, signers.alice.address, deadline);

    const [reserveAAfter, reserveBAfter] = await fixture.pairAB.getReserves();
    expect(reserveAAfter).to.be.gt(0n);
    expect(reserveBAfter).to.be.gt(0n);
  });

  it("Should handle multi-hop swap with intermediate liquidity changes", async function () {
    const amountIn = ethers.parseEther("20000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      await fixture.tokenD.getAddress(),
    ];

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
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
        ethers.parseEther("30000"),
        ethers.parseEther("60000"),
        0n,
        0n,
        signers.bob.address,
        deadline
      );

    await Promise.all([swapTx, liquidityTx]);

    const balanceD = await fixture.tokenD.balanceOf(signers.alice.address);
    expect(balanceD).to.be.gt(0n);
  });

  it("Should handle multiple concurrent multi-hop swaps", async function () {
    const amountIn = ethers.parseEther("10000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const path1 = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
    ];

    const path2 = [await fixture.tokenA.getAddress(), await fixture.tokenC.getAddress()];

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const tx1 = fixture.router
      .connect(signers.alice)
      .swapExactTokensForTokens(amountIn, 0n, path1, signers.alice.address, deadline);

    const tx2 = fixture.router
      .connect(signers.bob)
      .swapExactTokensForTokens(amountIn, 0n, path2, signers.bob.address, deadline);

    await Promise.all([tx1, tx2]);

    expect(await fixture.tokenC.balanceOf(signers.alice.address)).to.be.gt(0n);
    expect(await fixture.tokenC.balanceOf(signers.bob.address)).to.be.gt(0n);
  });

  it("Should handle stress test with many small swaps", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    // Perform many small swaps
    for (let i = 0; i < 20; i++) {
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(ethers.parseEther("100"), 0n, path, signers.alice.address, deadline);
    }

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
  });

  it("Should handle stress test with alternating operations", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Alternate between swap and liquidity operations
    for (let i = 0; i < 5; i++) {
      // Swap
      await fixture.router
        .connect(signers.alice)
        .swapExactTokensForTokens(ethers.parseEther("500"), 0n, path, signers.alice.address, deadline);

      // Add liquidity
      await fixture.router
        .connect(signers.alice)
        .addLiquidity(
          await fixture.tokenA.getAddress(),
          await fixture.tokenB.getAddress(),
          ethers.parseEther("200"),
          ethers.parseEther("400"),
          0n,
          0n,
          signers.alice.address,
          deadline
        );
    }

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
  });
});

