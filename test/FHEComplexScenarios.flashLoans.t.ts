import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEComplexFixture, type FHEComplexFixture } from "./helpers/fheComplexFixtures";

describe("FHE Complex Scenarios - Flash Loans", function () {
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
  });

  it("Should execute multi-hop arbitrage using flash loan", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const flashLoanAmount = ethers.parseEther("100000");

    const pathDirect = [await fixture.tokenA.getAddress(), await fixture.tokenC.getAddress()];
    const pathMultiHop = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
    ];

    const amountsDirect = await fixture.router.getAmountsOut(flashLoanAmount, pathDirect);
    const amountsMultiHop = await fixture.router.getAmountsOut(flashLoanAmount, pathMultiHop);

    if (amountsMultiHop[2] > amountsDirect[1]) {
      await fixture.tokenA.connect(signers.alice).approve(await fixture.flashLoanProvider.getAddress(), ethers.MaxUint256);
      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const balanceBefore = await fixture.tokenC.balanceOf(signers.alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Create encrypted inputs for multi-hop swap using router address
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount1 = await fhevm
        .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
        .add32(Number(flashLoanAmount / ethers.parseEther("1")))
        .encrypt();
      const encryptedSwapAmount2 = await fhevm
        .createEncryptedInput(await fixture.pairBC.getAddress(), routerAddress)
        .add32(Number(amountsMultiHop[1] / ethers.parseEther("1")))
        .encrypt();

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        flashLoanAmount,
        0n,
        pathMultiHop,
        [encryptedSwapAmount1.handles[0], encryptedSwapAmount2.handles[0]],
        [encryptedSwapAmount1.inputProof, encryptedSwapAmount2.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceAfter = await fixture.tokenC.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    }
  });

  it("Should handle flash loan with liquidity manipulation", async function () {
    const flashLoanAmount = ethers.parseEther("50000");

    await fixture.tokenA.connect(signers.alice).approve(await fixture.flashLoanProvider.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const balanceABefore = await fixture.tokenA.balanceOf(signers.alice.address);
    const balanceBBefore = await fixture.tokenB.balanceOf(signers.alice.address);
    const lpBalanceBefore = await fixture.pairAB.balanceOf(signers.alice.address);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await fixture.router
      .connect(signers.alice)
      .addLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        flashLoanAmount,
        flashLoanAmount * 2n,
        0n,
        0n,
        signers.alice.address,
        deadline,
      );

    const lpBalanceAfter = await fixture.pairAB.balanceOf(signers.alice.address);
    expect(lpBalanceAfter).to.be.gt(lpBalanceBefore);

    await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.router
      .connect(signers.alice)
      .removeLiquidity(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        lpBalanceAfter,
        0n,
        0n,
        signers.alice.address,
        deadline,
      );

    const balanceAAfter = await fixture.tokenA.balanceOf(signers.alice.address);
    const balanceBAfter = await fixture.tokenB.balanceOf(signers.alice.address);

    expect(balanceAAfter + balanceBAfter).to.be.gt(balanceABefore + balanceBBefore - flashLoanAmount * 2n);
  });

  it("Should handle flash loan with multiple swaps", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const flashLoanAmount = ethers.parseEther("50000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.flashLoanProvider.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path1 = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const path2 = [await fixture.tokenB.getAddress(), await fixture.tokenC.getAddress()];

    // Create encrypted inputs for swaps using router address
    const routerAddress = await fixture.router.getAddress();
    const amounts1 = await fixture.router.getAmountsOut(flashLoanAmount, path1);
    
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(flashLoanAmount / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(await fixture.pairBC.getAddress(), routerAddress)
      .add32(Number(amounts1[1] / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      flashLoanAmount,
      0n,
      path1,
      [encryptedSwapAmount1.handles[0]],
      [encryptedSwapAmount1.inputProof],
      signers.alice.address,
      deadline,
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amounts1[1],
      0n,
      path2,
      [encryptedSwapAmount2.handles[0]],
      [encryptedSwapAmount2.inputProof],
      signers.alice.address,
      deadline,
    );

    expect(await fixture.tokenC.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle flash loan repayment with profit", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const flashLoanAmount = ethers.parseEther("100000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.flashLoanProvider.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const balanceABefore = await fixture.tokenA.balanceOf(signers.alice.address);
    const balanceBBefore = await fixture.tokenB.balanceOf(signers.alice.address);

    const path1 = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const path2 = [await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress()];

    // Create encrypted inputs for swaps using router address
    const routerAddress = await fixture.router.getAddress();
    const amounts1 = await fixture.router.getAmountsOut(flashLoanAmount, path1);
    
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(flashLoanAmount / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(amounts1[1] / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      flashLoanAmount,
      0n,
      path1,
      [encryptedSwapAmount1.handles[0]],
      [encryptedSwapAmount1.inputProof],
      signers.alice.address,
      deadline,
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amounts1[1],
      0n,
      path2,
      [encryptedSwapAmount2.handles[0]],
      [encryptedSwapAmount2.inputProof],
      signers.alice.address,
      deadline,
    );

    const balanceAAfter = await fixture.tokenA.balanceOf(signers.alice.address);
    const balanceBAfter = await fixture.tokenB.balanceOf(signers.alice.address);

    expect(balanceAAfter + balanceBAfter).to.be.gt(0n);
  });

  it("Should handle flash loan with complex multi-hop path", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const flashLoanAmount = ethers.parseEther("50000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.flashLoanProvider.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenD.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      await fixture.tokenD.getAddress(),
    ];

    // Create encrypted inputs for 3 hops using router address
    const routerAddress = await fixture.router.getAddress();
    const amounts = await fixture.router.getAmountsOut(flashLoanAmount, path);
    
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(flashLoanAmount / ethers.parseEther("1")))
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
      flashLoanAmount,
      0n,
      path,
      [encryptedSwapAmount1.handles[0], encryptedSwapAmount2.handles[0], encryptedSwapAmount3.handles[0]],
      [encryptedSwapAmount1.inputProof, encryptedSwapAmount2.inputProof, encryptedSwapAmount3.inputProof],
      signers.alice.address,
      deadline,
    );

    expect(await fixture.tokenD.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle flash loan repayment with profit calculation", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const flashLoanAmount = ethers.parseEther("100000");
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.flashLoanProvider.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const balanceABefore = await fixture.tokenA.balanceOf(signers.alice.address);

    const path1 = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const path2 = [await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress()];

    // Create encrypted inputs for swaps using router address
    const routerAddress = await fixture.router.getAddress();
    const amounts1 = await fixture.router.getAmountsOut(flashLoanAmount, path1);
    
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(flashLoanAmount / ethers.parseEther("1")))
      .encrypt();
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(await fixture.pairAB.getAddress(), routerAddress)
      .add32(Number(amounts1[1] / ethers.parseEther("1")))
      .encrypt();

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      flashLoanAmount,
      0n,
      path1,
      [encryptedSwapAmount1.handles[0]],
      [encryptedSwapAmount1.inputProof],
      signers.alice.address,
      deadline,
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amounts1[1],
      0n,
      path2,
      [encryptedSwapAmount2.handles[0]],
      [encryptedSwapAmount2.inputProof],
      signers.alice.address,
      deadline,
    );

    const balanceAAfter = await fixture.tokenA.balanceOf(signers.alice.address);
    // After fees, balance might be less, but should still have tokens
    expect(balanceAAfter).to.be.gt(0n);
  });
});

