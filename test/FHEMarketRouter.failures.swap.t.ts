import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture } from "./helpers/fheRouterFixtures";
import { MockToken__factory } from "../../types";

describe("FHEMarketRouter - Swap Failures", function () {
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
  });

  describe("swapExactTokensForTokens Failures", function () {
    it("Should revert with invalid path (single token)", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(
            amountIn,
            0n,
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Invalid path");
    });

    it("Should revert with invalid encrypted amounts length", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(amountIn, 0n, path, [], [], signers.alice.address, deadline),
      ).to.be.revertedWith("FHEMarketRouter: Invalid encrypted amounts length");
    });

    it("Should revert with zero address recipient", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(
            amountIn,
            0n,
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            ethers.ZeroAddress,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Invalid to");
    });

    it("Should revert with expired deadline", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(
            amountIn,
            0n,
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Expired");
    });

    it("Should revert with insufficient output amount", async function () {
      const amountIn = ethers.parseEther("1000");
      const amountOutMin = ethers.parseEther("1000000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Insufficient output amount");
    });

    it("Should revert with non-existent pair in path", async function () {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
      const tokenD = await tokenFactory.deploy("TokenD", "TKD");

      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await tokenD.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountIn / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), amountIn);

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapExactTokensForTokens(
            amountIn,
            0n,
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Pair does not exist");
    });
  });

  describe("swapTokensForExactTokens Failures", function () {
    it("Should revert with invalid path", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountOut / ethers.parseEther("1")))
        .encrypt();

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(
            amountOut,
            ethers.parseEther("10000"),
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Invalid path");
    });

    it("Should revert with zero address recipient", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountOut / ethers.parseEther("1")))
        .encrypt();

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(
            amountOut,
            ethers.parseEther("10000"),
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            ethers.ZeroAddress,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Invalid to");
    });

    it("Should revert with expired deadline", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(pairAddress, signers.alice.address)
        .add32(Number(amountOut / ethers.parseEther("1")))
        .encrypt();

      await expect(
        fixture.router
          .connect(signers.alice)
          .swapTokensForExactTokens(
            amountOut,
            ethers.parseEther("10000"),
            path,
            [encryptedSwapAmount.handles[0]],
            [encryptedSwapAmount.inputProof],
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Expired");
    });
  });

  describe("getAmountsOut Failures", function () {
    it("Should revert for invalid path", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];

      await expect(fixture.router.getAmountsOut(amountIn, path)).to.be.revertedWith("FHEMarketRouter: Invalid path");
    });
  });

  describe("getAmountsIn Failures", function () {
    it("Should revert for invalid path", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress()];

      await expect(fixture.router.getAmountsIn(amountOut, path)).to.be.revertedWith("FHEMarketRouter: Invalid path");
    });
  });
});

