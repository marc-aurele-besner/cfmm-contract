import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture } from "./helpers/fheRouterFixtures";

describe("FHEMarketRouter - Liquidity Failures", function () {
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

  describe("addLiquidity Failures", function () {
    it("Should revert with identical token addresses", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedAmountA = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("1000") / ethers.parseEther("1"))).encrypt();
      const encryptedAmountB = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("2000") / ethers.parseEther("1"))).encrypt();
      
      await expect(
        fixture.router
          .connect(signers.alice)
          .addLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenA.getAddress(),
            ethers.parseEther("1000"),
            ethers.parseEther("2000"),
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
          ),
      ).to.be.revertedWith("FHEMarketRouter: Identical addresses");
    });

    it("Should revert with zero address token", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedAmountA = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("1000") / ethers.parseEther("1"))).encrypt();
      const encryptedAmountB = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("2000") / ethers.parseEther("1"))).encrypt();
      
      await expect(
        fixture.router
          .connect(signers.alice)
          .addLiquidity(
            ethers.ZeroAddress,
            await fixture.tokenB.getAddress(),
            ethers.parseEther("1000"),
            ethers.parseEther("2000"),
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
          ),
      ).to.be.revertedWith("FHEMarketRouter: Pair does not exist");
    });

    it("Should revert with expired deadline", async function () {
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedAmountA = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("1000") / ethers.parseEther("1"))).encrypt();
      const encryptedAmountB = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("2000") / ethers.parseEther("1"))).encrypt();
      
      await expect(
        fixture.router
          .connect(signers.alice)
          .addLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenB.getAddress(),
            ethers.parseEther("1000"),
            ethers.parseEther("2000"),
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
          ),
      ).to.be.revertedWith("FHEMarketRouter: Expired");
    });
  });

  describe("removeLiquidity Failures", function () {
    beforeEach(async function () {
      // Add liquidity first
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.tokenB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
      await fixture.pairAB.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

      const pairAddress = await fixture.pairAB.getAddress();
      const routerAddress = await fixture.router.getAddress();
      const encryptedAmountA = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("1000") / ethers.parseEther("1"))).encrypt();
      const encryptedAmountB = await fhevm.createEncryptedInput(pairAddress, routerAddress).add64(Number(ethers.parseEther("2000") / ethers.parseEther("1"))).encrypt();
      
      await fixture.router
        .connect(signers.alice)
          .addLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenB.getAddress(),
            ethers.parseEther("1000"),
            ethers.parseEther("2000"),
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
    });

    it("Should revert with zero address token", async function () {
      const liquidity = await fixture.pairAB.balanceOf(signers.alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .removeLiquidity(
            ethers.ZeroAddress,
            await fixture.tokenB.getAddress(),
            liquidity,
            0n,
            0n,
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Pair does not exist");
    });

    it("Should revert with expired deadline", async function () {
      const liquidity = await fixture.pairAB.balanceOf(signers.alice.address);
      const deadline = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        fixture.router
          .connect(signers.alice)
          .removeLiquidity(
            await fixture.tokenA.getAddress(),
            await fixture.tokenB.getAddress(),
            liquidity,
            0n,
            0n,
            signers.alice.address,
            deadline,
          ),
      ).to.be.revertedWith("FHEMarketRouter: Expired");
    });
  });
});




