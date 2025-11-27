import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEComplexFixture, type FHEComplexFixture } from "./helpers/fheComplexFixtures";

describe("FHE Complex Scenarios - Stress Tests", function () {
  let fixture: FHEComplexFixture;
  let signers: FHESigners;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    fixture = await loadFixture(deployFHEComplexFixture);
    signers = await getFHESigners();

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
    // Workaround: Create encrypted input for router address instead of user address
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const routerAddress = await fixture.router.getAddress();
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

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
          deadline,
        );

      // Create encrypted input for swap using router address
      const swapAmount = ethers.parseEther("500");
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
        .add32(Number(swapAmount / ethers.parseEther("1")))
        .encrypt();

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        swapAmount,
        0n,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );

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
            deadline,
          );
      }
    }

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
  });

  it("Should handle extreme price movements", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const largeSwap = ethers.parseEther("80000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Create encrypted input for swap using router address
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(largeSwap / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      largeSwap,
      0n,
      path,
      [encryptedSwapAmount1.handles[0]],
      [encryptedSwapAmount1.inputProof],
      signers.alice.address,
      deadline,
    );

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);

    const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
    const reversePath = [await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress()];

    // Create encrypted input for reverse swap
    const swapAmountReverse = balanceB / 2n;
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(swapAmountReverse / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      swapAmountReverse,
      0n,
      reversePath,
      [encryptedSwapAmount2.handles[0]],
      [encryptedSwapAmount2.inputProof],
      signers.alice.address,
      deadline,
    );

    const [reserveAAfter, reserveBAfter] = await fixture.pairAB.getReserves();
    expect(reserveAAfter).to.be.gt(0n);
    expect(reserveBAfter).to.be.gt(0n);
  });

  it("Should handle multi-hop swap with intermediate liquidity changes", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
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

    // Create encrypted inputs for 3 hops using router address
    const routerAddress = await fixture.router.getAddress();
    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(amountIn / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(await fixture.pairBC.getAddress(), routerAddress)
      .add32(Number(amounts[1] / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount3 = await fhevm
      .createEncryptedInput(await fixture.pairCD.getAddress(), routerAddress)
      .add32(Number(amounts[2] / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      [encryptedSwapAmount1.handles[0], encryptedSwapAmount2.handles[0], encryptedSwapAmount3.handles[0]],
      [encryptedSwapAmount1.inputProof, encryptedSwapAmount2.inputProof, encryptedSwapAmount3.inputProof],
      signers.alice.address,
      deadline,
    );

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
        deadline,
      );

    await liquidityTx;

    const balanceD = await fixture.tokenD.balanceOf(signers.alice.address);
    expect(balanceD).to.be.gt(0n);
  });

  it("Should handle multiple concurrent multi-hop swaps", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
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

    // Create encrypted inputs for swaps using router address
    const routerAddress = await fixture.router.getAddress();
    const amounts1 = await fixture.router.getAmountsOut(amountIn, path1);
    const amounts2 = await fixture.router.getAmountsOut(amountIn, path2);
    
    const encryptedSwapAmount1_1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(amountIn / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount1_2 = await fhevm
      .createEncryptedInput(await fixture.pairBC.getAddress(), routerAddress)
      .add32(Number(amounts1[1] / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(await fixture.pairAC.getAddress(), routerAddress)
      .add32(Number(amountIn / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path1,
      [encryptedSwapAmount1_1.handles[0], encryptedSwapAmount1_2.handles[0]],
      [encryptedSwapAmount1_1.inputProof, encryptedSwapAmount1_2.inputProof],
      signers.alice.address,
      deadline,
    );

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      amountIn,
      0n,
      path2,
      [encryptedSwapAmount2.handles[0]],
      [encryptedSwapAmount2.inputProof],
      signers.bob.address,
      deadline,
    );

    expect(await fixture.tokenC.balanceOf(signers.alice.address)).to.be.gt(0n);
    expect(await fixture.tokenC.balanceOf(signers.bob.address)).to.be.gt(0n);
  });

  it("Should handle stress test with many small swaps", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    // Perform many small swaps using router address
    const routerAddress = await fixture.router.getAddress();
    const swapAmount = ethers.parseEther("100");
    
    for (let i = 0; i < 20; i++) {
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
        .add32(Number(swapAmount / ethers.parseEther("1")))
        .encrypt();

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        swapAmount,
        0n,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );
    }

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
  });

  it("Should handle stress test with alternating operations", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const routerAddress = await fixture.router.getAddress();
    const swapAmount = ethers.parseEther("500");

    // Alternate between swap and liquidity operations
    for (let i = 0; i < 5; i++) {
      // Create encrypted input for swap using router address
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
        .add32(Number(swapAmount / ethers.parseEther("1")))
        .encrypt();

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        swapAmount,
        0n,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );

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
          deadline,
        );
    }

    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
  });
});

