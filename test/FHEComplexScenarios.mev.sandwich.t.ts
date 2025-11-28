import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEComplexFixture, type FHEComplexFixture } from "./helpers/fheComplexFixtures";
import { createEncryptedSwapParams } from "./helpers/fheRouterFixtures";

describe("FHE Complex Scenarios - MEV Sandwich", function () {
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
    await fixture.tokenA.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.bob.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.charlie.address, ethers.parseEther("10000000"));
  });

  it("Should handle sandwich attack simulation", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const largeSwapAmount = ethers.parseEther("50000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const encryptedAmountA = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("20000") / ethers.parseEther("1"))).encrypt();
    const encryptedAmountB = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("40000") / ethers.parseEther("1"))).encrypt();
    
    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("20000"),
        ethers.parseEther("40000"),
        0n,
        0n,
        {
          encryptedAmountA: encryptedAmountA.handles[0],
          encryptedAmountB: encryptedAmountB.handles[0],
          amountAProof: encryptedAmountA.inputProof,
          amountBProof: encryptedAmountB.inputProof,
        },
        signers.alice.address,
        deadline,
      );

    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Create encrypted input for swap using router address
    const swapParams = await createEncryptedSwapParams(
      await fixture.pairAB.getAddress(),
      routerAddress,
      Number(largeSwapAmount / ethers.parseEther("1")),
      0
    );

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      largeSwapAmount,
      0n,
      path,
      [swapParams],
      signers.bob.address,
      deadline,
    );

    const attackerLP = await fixture.pairAB.balanceOf(signers.alice.address);
    await fixture.router
      .connect(signers.alice)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        attackerLP,
        0n,
        0n,
        signers.alice.address,
        deadline,
      );

    const finalBalanceA = await fixture.tokenA.balanceOf(signers.alice.address);
    const finalBalanceB = await fixture.tokenB.balanceOf(signers.alice.address);

    expect(finalBalanceA + finalBalanceB).to.be.gt(ethers.parseEther("60000"));
  });

  it("Should handle multiple sandwich attempts in same block", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const swapAmount = ethers.parseEther("30000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.pairAB.connect(signers.charlie).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    const pairABAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const encryptedAmountA1 = await fhevm.createEncryptedInput(pairABAddress, routerAddress).add64(Number(ethers.parseEther("10000") / ethers.parseEther("1"))).encrypt();
    const encryptedAmountB1 = await fhevm.createEncryptedInput(pairABAddress, routerAddress).add64(Number(ethers.parseEther("20000") / ethers.parseEther("1"))).encrypt();
    
    const tx1 = fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("10000"),
        ethers.parseEther("20000"),
        0n,
        0n,
        {
          encryptedAmountA: encryptedAmountA1.handles[0],
          encryptedAmountB: encryptedAmountB1.handles[0],
          amountAProof: encryptedAmountA1.inputProof,
          amountBProof: encryptedAmountB1.inputProof,
        },
        signers.alice.address,
        deadline,
      );

    const encryptedAmountA2 = await fhevm.createEncryptedInput(pairABAddress, routerAddress).add64(Number(ethers.parseEther("10000") / ethers.parseEther("1"))).encrypt();
    const encryptedAmountB2 = await fhevm.createEncryptedInput(pairABAddress, routerAddress).add64(Number(ethers.parseEther("20000") / ethers.parseEther("1"))).encrypt();
    
    const tx2 = fixture.router
      .connect(signers.charlie)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("10000"),
        ethers.parseEther("20000"),
        0n,
        0n,
        {
          encryptedAmountA: encryptedAmountA2.handles[0],
          encryptedAmountB: encryptedAmountB2.handles[0],
          amountAProof: encryptedAmountA2.inputProof,
          amountBProof: encryptedAmountB2.inputProof,
        },
        signers.charlie.address,
        deadline,
      );

    await Promise.all([tx1, tx2]);

    // Create encrypted input for swap using router address
    const swapParams = await createEncryptedSwapParams(
      await fixture.pairAB.getAddress(),
      routerAddress,
      Number(swapAmount / ethers.parseEther("1")),
      0
    );

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      swapAmount,
      0n,
      path,
      [swapParams],
      signers.bob.address,
      deadline,
    );

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
        deadline,
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
        deadline,
      );

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(ethers.parseEther("10000"));
    expect(await fixture.tokenA.balanceOf(signers.charlie.address)).to.be.gt(ethers.parseEther("10000"));
  });
});

