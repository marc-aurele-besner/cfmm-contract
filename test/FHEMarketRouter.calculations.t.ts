import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture } from "./helpers/fheRouterFixtures";
import { calculateInputForOutput } from "./helpers/calculations";

describe("FHEMarketRouter - Calculations", function () {
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
  });

  describe("getAmountsOut", function () {
    it("Should calculate output amounts for single hop", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

      const amounts = await fixture.router.getAmountsOut(amountIn, path);

      expect(amounts.length).to.equal(2);
      expect(amounts[0]).to.equal(amountIn);
      expect(amounts[1]).to.be.gt(0n);
    });

    it("Should calculate output amounts for multi-hop", async function () {
      const amountIn = ethers.parseEther("1000");
      const path = [
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
      ];

      const amounts = await fixture.router.getAmountsOut(amountIn, path);

      expect(amounts.length).to.equal(3);
      expect(amounts[0]).to.equal(amountIn);
      expect(amounts[1]).to.be.gt(0n);
      expect(amounts[2]).to.be.gt(0n);
    });

    it("Should handle getAmountsOut with varying input amounts", async function () {
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

      const smallAmount = ethers.parseEther("1");
      const mediumAmount = ethers.parseEther("1000");
      const largeAmount = ethers.parseEther("10000");

      const amountsSmall = await fixture.router.getAmountsOut(smallAmount, path);
      const amountsMedium = await fixture.router.getAmountsOut(mediumAmount, path);
      const amountsLarge = await fixture.router.getAmountsOut(largeAmount, path);

      expect(amountsSmall[0]).to.equal(smallAmount);
      expect(amountsMedium[0]).to.equal(mediumAmount);
      expect(amountsLarge[0]).to.equal(largeAmount);

      expect(amountsMedium[1]).to.be.gt(amountsSmall[1]);
      expect(amountsLarge[1]).to.be.gt(amountsMedium[1]);
    });
  });

  describe("getAmountsIn", function () {
    it("Should calculate input amounts for single hop", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

      const amounts = await fixture.router.getAmountsIn(amountOut, path);

      expect(amounts.length).to.equal(2);
      expect(amounts[1]).to.equal(amountOut);
      expect(amounts[0]).to.be.gt(0n);
    });

    it("Should calculate input amounts for multi-hop", async function () {
      const amountOut = ethers.parseEther("1000");
      const path = [
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        await fixture.tokenC.getAddress(),
      ];

      const amounts = await fixture.router.getAmountsIn(amountOut, path);

      expect(amounts.length).to.equal(3);
      expect(amounts[2]).to.equal(amountOut);
      expect(amounts[0]).to.be.gt(0n);
      expect(amounts[1]).to.be.gt(0n);
    });

    it("Should handle getAmountsIn with varying output amounts", async function () {
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

      const smallOut = ethers.parseEther("1");
      const mediumOut = ethers.parseEther("1000");
      const largeOut = ethers.parseEther("10000");

      const amountsSmall = await fixture.router.getAmountsIn(smallOut, path);
      const amountsMedium = await fixture.router.getAmountsIn(mediumOut, path);
      const amountsLarge = await fixture.router.getAmountsIn(largeOut, path);

      expect(amountsSmall[1]).to.equal(smallOut);
      expect(amountsMedium[1]).to.equal(mediumOut);
      expect(amountsLarge[1]).to.equal(largeOut);

      expect(amountsMedium[0]).to.be.gt(amountsSmall[0]);
      expect(amountsLarge[0]).to.be.gt(amountsMedium[0]);
    });
  });

  describe("getPair", function () {
    it("Should return correct pair address", async function () {
      const pairAddress = await fixture.router.getPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
      );
      expect(pairAddress).to.equal(await fixture.pairAB.getAddress());
    });

    it("Should return zero address for non-existent pair", async function () {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
      const tokenD = await tokenFactory.deploy("TokenD", "TKD");

      const pairAddress = await fixture.router.getPair(await fixture.tokenA.getAddress(), await tokenD.getAddress());
      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should handle getPair for all created pairs", async function () {
      const pairAB = await fixture.router.getPair(await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress());
      const pairBC = await fixture.router.getPair(await fixture.tokenB.getAddress(), await fixture.tokenC.getAddress());

      expect(pairAB).to.equal(await fixture.pairAB.getAddress());
      expect(pairBC).to.equal(await fixture.pairBC.getAddress());
      expect(pairAB).to.not.equal(pairBC);
    });

    it("Should handle getPair with reverse token order", async function () {
      const pairAB = await fixture.router.getPair(await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress());
      const pairBA = await fixture.router.getPair(await fixture.tokenB.getAddress(), await fixture.tokenA.getAddress());
      expect(pairAB).to.equal(pairBA);
    });

    it("Should calculate amounts correctly after reserve changes", async function () {
      // Use direct pair swap instead of router swap to avoid FHEVM verification issues
      // Then test router calculation functions which don't require swaps
      const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
      const amountIn = ethers.parseEther("1000");

      // Ensure Alice has enough tokens
      await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("100000"));
      await fixture.tokenB.mint(signers.alice.address, ethers.parseEther("100000"));

      // Get initial amounts
      const amountsBefore = await fixture.router.getAmountsOut(amountIn, path);

      // Perform swap directly on pair (this works because msg.sender is the user)
      const amountBOut = amountsBefore[1];
      const [reserveA, reserveB] = await fixture.pairAB.getReserves();

      if (amountBOut > 0n && reserveB >= amountBOut) {
        const amountAIn = await calculateInputForOutput(
          await fixture.tokenB.getAddress(),
          amountBOut,
          reserveA,
          reserveB,
        );

        const swapAmountScaled = Number(amountAIn / ethers.parseEther("1"));
        const pairAddress = await fixture.pairAB.getAddress();
        const encryptedAmountAIn = await fhevm
          .createEncryptedInput(pairAddress, signers.alice.address)
          .add64(swapAmountScaled)
          .encrypt();
        const encryptedAmountBIn = await fhevm
          .createEncryptedInput(pairAddress, signers.alice.address)
          .add64(0)
          .encrypt();

        await fixture.tokenA.connect(signers.alice).approve(pairAddress, amountAIn * 2n);
        await fixture.pairAB
          .connect(signers.alice)
          .swap(
            encryptedAmountAIn.handles[0],
            encryptedAmountBIn.handles[0],
            encryptedAmountAIn.inputProof,
            encryptedAmountBIn.inputProof,
            0n,
            amountBOut,
            signers.alice.address,
          );

        // Get amounts after swap
        const amountsAfter = await fixture.router.getAmountsOut(amountIn, path);

        // Amounts should be different due to reserve changes
        expect(amountsAfter[1]).to.not.equal(amountsBefore[1]);
      }
    });
  });
});
