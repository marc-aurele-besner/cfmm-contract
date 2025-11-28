import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture, createEncryptedSwapParams } from "./helpers/fheRouterFixtures";

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

      // Create encrypted swap params for router address (where msg.sender will be when pair is called)
      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const swapParams = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")), // A in
        0 // B in
      );

      const balanceBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [swapParams],
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

      // Create encrypted swap params for each hop (use router address for signer)
      const pairABAddress = await fixture.pairAB.getAddress();
      const pairBCAddress = await fixture.pairBC.getAddress();
      const routerAddress = await fixture.router.getAddress();
      
      const swapParams1 = await createEncryptedSwapParams(
        pairABAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")), // A in
        0 // B in
      );
      
      const swapParams2 = await createEncryptedSwapParams(
        pairBCAddress,
        routerAddress,
        0, // A in
        Number(amountIn / ethers.parseEther("1")) // B in
      );

      const balanceBefore = await fixture.tokenC.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [swapParams1, swapParams2],
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

      // Create encrypted swap params (use router address for signer)
      const pairABAddress = await fixture.pairAB.getAddress();
      const pairBCAddress = await fixture.pairBC.getAddress();
      const routerAddress = await fixture.router.getAddress();
      
      const swapParams1 = await createEncryptedSwapParams(
        pairABAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")),
        0
      );
      const swapParams2 = await createEncryptedSwapParams(
        pairBCAddress,
        routerAddress,
        0,
        Number(amountIn / ethers.parseEther("1"))
      );

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [swapParams1, swapParams2],
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
      
      const swapParamsAlice = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")),
        0
      );
      const swapParamsBob = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")),
        0
      );

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const tx1 = fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [swapParamsAlice],
        signers.alice.address,
        deadline,
      );

      const tx2 = fixture.router.connect(signers.bob).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [swapParamsBob],
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
      
      const swapParams = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")),
        0
      );

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [swapParams],
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
      
      // For swapTokensForExactTokens, we need to estimate the input amount
      const amounts = await fixture.router.getAmountsIn(amountOut, path);
      const swapParams = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        Number(amounts[0] / ethers.parseEther("1")),
        0
      );

      const balanceBefore = await fixture.tokenB.balanceOf(signers.alice.address);

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapTokensForExactTokens(
        amountOut,
        amountInMax,
        path,
        [swapParams],
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
      
      const swapParams = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        Number(amountIn / ethers.parseEther("1")),
        0
      );

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        [swapParams],
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
      
      // For reverse swap (B -> A), we use B as input
      const swapParams = await createEncryptedSwapParams(
        pairAddress,
        routerAddress,
        0,
        Number(amountIn / ethers.parseEther("1"))
      );

      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const balanceBefore = await fixture.tokenA.balanceOf(signers.alice.address);
      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [swapParams],
        signers.alice.address,
        deadline,
      );
      const balanceAfter = await fixture.tokenA.balanceOf(signers.alice.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });
});

