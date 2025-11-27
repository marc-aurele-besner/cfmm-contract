import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture } from "./helpers/fheRouterFixtures";

describe("FHEMarketRouter - Swap", function () {
  let signers: FHESigners;
  let fixture: FHERouterFixture;

  before(async function () {
    signers = await getFHESigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    fixture = await loadFixture(deployFHERouterFixture);

    // Mint tokens to users
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenB.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenA.mint(signers.bob.address, ethers.parseEther("100000"));
    await fixture.tokenB.mint(signers.bob.address, ethers.parseEther("100000"));
  });

  describe("swapExactTokensForTokens", function () {
    it("Should swap exact tokens for tokens (single hop)", async function () {
      // Workaround: Create encrypted input for router address instead of user address
      // When router calls pair.swap(), msg.sender is router, so encrypted input must be for router
      const amountIn = ethers.parseEther("1000");
      const amountOutMin = ethers.parseEther("1");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Create encrypted swap amount for router address (where msg.sender will be when pair is called)
      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address, not user!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      const balanceBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceAfter = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should swap exact tokens for tokens (multi-hop)", async function () {
      // Workaround: Create encrypted inputs for router address instead of user address
      const amountIn = ethers.parseEther("1000");
      const amountOutMin = ethers.parseEther("1");
      const path = [
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
      ];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Create encrypted swap amounts for each hop (use router address for signer)
      const pairABAddress = await fixture.pairAB.getAddress();
      const pairBCAddress = await fixture.pairBC.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount1 = await fhevm
        .createEncryptedInput(pairABAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();
      const encryptedSwapAmount2 = await fhevm
        .createEncryptedInput(pairBCAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      const balanceBefore = await fixture.tokenC.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [encryptedSwapAmount1.handles[0], encryptedSwapAmount2.handles[0]],
        [encryptedSwapAmount1.inputProof, encryptedSwapAmount2.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceAfter = await fixture.tokenC.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should handle multi-hop swap with optimal path", async function () {
      // Workaround: Create encrypted inputs for router address instead of user address
      const amountIn = ethers.parseEther("1000");
      const path = [
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
      ];

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenC.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amounts = await fixture.router.getAmountsOut(amountIn, path);

      // Create encrypted swap amounts (use router address for signer)
      const pairABAddress = await fixture.pairAB.getAddress();
      const pairBCAddress = await fixture.pairBC.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount1 = await fhevm
        .createEncryptedInput(pairABAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();
      const encryptedSwapAmount2 = await fhevm
        .createEncryptedInput(pairBCAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [encryptedSwapAmount1.handles[0], encryptedSwapAmount2.handles[0]],
        [encryptedSwapAmount1.inputProof, encryptedSwapAmount2.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceC = await fixture.tokenC.balanceOf(signers.alice.address);
      expect(balanceC).to.be.gt(0n);
      expect(balanceC).to.be.gte(amounts[2] - (amounts[2] * 1n) / 1000n);
    });

    it("Should handle concurrent swaps through same pair", async function () {
      // Workaround: Create encrypted inputs for router address instead of user address
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmountAlice = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();
      const encryptedSwapAmountBob = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const tx1 = fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [encryptedSwapAmountAlice.handles[0]],
        [encryptedSwapAmountAlice.inputProof],
        signers.alice.address,
        deadline,
      );

      const tx2 = fixture.router.connect(signers.bob).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [encryptedSwapAmountBob.handles[0]],
        [encryptedSwapAmountBob.inputProof],
        signers.bob.address,
        deadline,
      );

      await Promise.all([tx1, tx2]);

      expect(await fixture.tokenB.balanceOf(signers.alice.address)).to.be.gt(0n);
      expect(await fixture.tokenB.balanceOf(signers.bob.address)).to.be.gt(0n);
    });

    it("Should handle swap with minimum slippage tolerance", async function () {
      // Workaround: Create encrypted input for router address instead of user address
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const amounts = await fixture.router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] - (amounts[1] * 1n) / 100n; // 1% slippage tolerance

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceB).to.be.gte(amountOutMin);
    });
  });

  describe("swapTokensForExactTokens", function () {
    it("Should swap tokens for exact tokens (single hop)", async function () {
      // Workaround: Create encrypted input for router address instead of user address
      const amountOut = ethers.parseEther("1000");
      const amountInMax = ethers.parseEther("10000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add32(Number(amountOut / ethers.parseEther("1")))
        .encrypt();

      const balanceBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapTokensForExactTokens(
        amountOut,
        amountInMax,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceAfter = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should handle swap with exact minimum output", async function () {
      // Workaround: Create encrypted input for router address instead of user address
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const amounts = await fixture.router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] - (amounts[1] * 1n) / 100n; // 1% slippage

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );

      const balanceB = await fixture.tokenB.balanceOf(signers.alice.address);
      expect(balanceB).to.be.gte(amountOutMin);
    });

    it("Should handle reverse swap path", async function () {
      // Workaround: Create encrypted input for router address instead of user address
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const balanceBefore = await fixture.tokenA.balanceOf(signers.alice.address);
      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [encryptedSwapAmount.handles[0]],
        [encryptedSwapAmount.inputProof],
        signers.alice.address,
        deadline,
      );
      const balanceAfter = await fixture.tokenA.balanceOf(signers.alice.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });
});

