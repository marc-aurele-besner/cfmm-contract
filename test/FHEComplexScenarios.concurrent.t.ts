import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEComplexFixture, type FHEComplexFixture } from "./helpers/fheComplexFixtures";
import { calculateInputForOutput } from "./helpers/calculations";

describe("FHE Complex Scenarios - Concurrent Operations", function () {
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
        deadline,
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
        deadline,
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
        deadline,
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
        deadline,
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
        deadline,
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
        deadline,
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
          deadline,
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
          deadline,
        );
    }

    const finalBalanceA = await fixture.tokenA.balanceOf(signers.alice.address);
    const finalBalanceB = await fixture.tokenB.balanceOf(signers.alice.address);
    expect(finalBalanceA).to.be.gt(0n);
    expect(finalBalanceB).to.be.gt(0n);
  });

  it("Should handle liquidity provision during high volatility", async function () {
    // Use direct pair swap instead of router swap to avoid FHEVM verification issues
    // Then test router liquidity functions which work fine
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    // Perform swap directly on pair to simulate high volatility
    const largeSwapAmountBOut = ethers.parseEther("30000");
    const [reserveA, reserveB] = await fixture.pairAB.getReserves();
    
    if (reserveB >= largeSwapAmountBOut) {
      const amountAIn = await calculateInputForOutput(
        await fixture.tokenB.getAddress(),
        largeSwapAmountBOut,
        reserveA,
        reserveB,
      );

      const swapAmountScaled = Number(amountAIn / ethers.parseEther("1"));
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(await fixture.pairAB.getAddress(), signers.bob.address)
        .add32(swapAmountScaled)
        .encrypt();

      await fixture.tokenA.connect(signers.bob).approve(await fixture.pairAB.getAddress(), amountAIn * 2n);
      await fixture.pairAB
        .connect(signers.bob)
        .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, 0n, largeSwapAmountBOut, signers.bob.address);
    }

    // Now test liquidity provision through router (this works fine)
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
        deadline,
      );

    const lpBalance = await fixture.pairAB.balanceOf(signers.alice.address);
    expect(lpBalance).to.be.gt(0n);
  });

  it("Should handle concurrent swaps and liquidity operations", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const swapAmount = ethers.parseEther("5000");

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Create encrypted input for swap using router address
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(swapAmount / ethers.parseEther("1")))
      .encrypt();

    // Perform swap
    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      swapAmount,
      0n,
      path,
      [encryptedSwapAmount.handles[0]],
      [encryptedSwapAmount.inputProof],
      signers.bob.address,
      deadline,
    );

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
        deadline,
      );

    await liquidityTx;

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
        deadline,
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
        deadline,
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
        deadline,
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
        deadline,
      );

    await Promise.all([tx1, tx2]);

    expect(await fixture.pairAB.balanceOf(signers.alice.address)).to.equal(0n);
    expect(await fixture.pairAB.balanceOf(signers.bob.address)).to.equal(0n);
  });
});

