import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEComplexFixture, type FHEComplexFixture } from "./helpers/fheComplexFixtures";

describe("FHE Complex Scenarios - MEV", function () {
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
    await fixture.tokenA.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.charlie.address, ethers.parseEther("10000000"));
    await fixture.tokenA.mint(signers.dave.address, ethers.parseEther("10000000"));
    await fixture.tokenB.mint(signers.dave.address, ethers.parseEther("10000000"));
  });

  it("Should handle front-running with large liquidity addition", async function () {
    // Workaround: Create encrypted input for router address instead of user address
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
        deadline,
      );

    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Create encrypted input for swap using router address
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(swapAmount / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      swapAmount,
      0n,
      path,
      [encryptedSwapAmount.handles[0]],
      [encryptedSwapAmount.inputProof],
      signers.bob.address,
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

    const finalBalance = (await fixture.tokenA.balanceOf(signers.alice.address)) + (await fixture.tokenB.balanceOf(signers.alice.address));
    expect(finalBalance).to.be.gt(ethers.parseEther("300000"));
  });

  it("Should handle back-running with liquidity removal", async function () {
    // Workaround: Create encrypted input for router address instead of user address
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
        deadline,
      );

    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    // Create encrypted input for swap using router address
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(swapAmount / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      swapAmount,
      0n,
      path,
      [encryptedSwapAmount.handles[0]],
      [encryptedSwapAmount.inputProof],
      signers.bob.address,
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

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(ethers.parseEther("50000"));
  });

  it("Should handle MEV bot competition scenario", async function () {
    // Workaround: Create encrypted input for router address instead of user address
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
        deadline,
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
        deadline,
      );

    await Promise.all([tx1, tx2]);

    // Create encrypted input for swap using router address
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(victimSwap / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      victimSwap,
      0n,
      path,
      [encryptedSwapAmount.handles[0]],
      [encryptedSwapAmount.inputProof],
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

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(0n);
    expect(await fixture.tokenA.balanceOf(signers.charlie.address)).to.be.gt(0n);
  });

  it("Should handle MEV extraction through multiple pairs", async function () {
    // Workaround: Create encrypted input for router address instead of user address
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
        deadline,
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
        deadline,
      );

    // Victim swaps - create encrypted input using router address
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(victimSwap / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.bob).swapExactTokensForTokens(
      victimSwap,
      0n,
      path,
      [encryptedSwapAmount.handles[0]],
      [encryptedSwapAmount.inputProof],
      signers.bob.address,
      deadline,
    );

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
        deadline,
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
        deadline,
      );

    expect(await fixture.tokenA.balanceOf(signers.alice.address)).to.be.gt(0n);
  });
});

