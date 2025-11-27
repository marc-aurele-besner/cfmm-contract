import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEFactoryFixture, type FHEFactoryFixture } from "./helpers/fheFactoryFixtures";

describe("FHESplitFeeFactory - Pair Queries", function () {
  let signers: FHESigners;
  let fixture: FHEFactoryFixture;

  before(async function () {
    signers = await getFHESigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    fixture = await loadFixture(deployFHEFactoryFixture);
  });

  describe("getPairAddress", function () {
    it("Should return zero address for non-existent pair", async function () {
      const pairAddress = await fixture.factory.getPairAddress(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
      );
      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return correct pair address after creation", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      const tx = await fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        amountA,
        amountB,
      );

      const receipt = await tx.wait();
      const pairAddress = await fixture.factory.getPairAddress(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
      );

      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
      expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
    });

    it("Should handle creating pairs with different token orders", async function () {
      await fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );

      const addressXY = await fixture.factory.getPairAddress(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
      );

      const addressYX = await fixture.factory.getPairAddress(
        await fixture.tokenB.getAddress(),
        await fixture.tokenA.getAddress(),
      );

      expect(addressXY).to.equal(addressYX);
    });

    it("Should return correct pair address for all created pairs", async function () {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
      const tokenX = await tokenFactory.deploy("TokenX", "TKX");
      const tokenY = await tokenFactory.deploy("TokenY", "TKY");

      const tx = await fixture.factory.createPair(
        await tokenX.getAddress(),
        await tokenY.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );

      const receipt = await tx.wait();
      const pairAddress = await fixture.factory.getPairAddress(
        await tokenX.getAddress(),
        await tokenY.getAddress(),
      );

      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
      expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
    });
  });

  describe("getIsPair", function () {
    it("Should return false for non-existent pair", async function () {
      const nonPairAddress = await fixture.tokenA.getAddress();
      expect(await fixture.factory.getIsPair(nonPairAddress)).to.be.false;
    });

    it("Should return true for created pair", async function () {
      await fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );

      const pairAddress = await fixture.factory.getPairAddress(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
      );

      expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
    });

    it("Should correctly identify pair addresses", async function () {
      await fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );

      const pairAddress = await fixture.factory.getPairAddress(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
      );
      const nonPairAddress = await fixture.tokenA.getAddress();

      expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
      expect(await fixture.factory.getIsPair(nonPairAddress)).to.be.false;
      expect(await fixture.factory.getIsPair(await fixture.factory.getAddress())).to.be.false;
    });
  });

  describe("Pair Count", function () {
    it("Should maintain pair count consistency", async function () {
      const countBefore = await fixture.factory.pairCount();

      const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
      const tokenX = await tokenFactory.deploy("TokenX", "TKX");
      const tokenY = await tokenFactory.deploy("TokenY", "TKY");
      const tokenZ = await tokenFactory.deploy("TokenZ", "TKZ");

      await fixture.factory.createPair(
        await tokenX.getAddress(),
        await tokenY.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );

      await fixture.factory.createPair(
        await tokenY.getAddress(),
        await tokenZ.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );

      const countAfter = await fixture.factory.pairCount();
      expect(countAfter).to.equal(countBefore + 2n);
    });

    it("Should handle pair creation with maximum amounts", async function () {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
      const tokenX = await tokenFactory.deploy("TokenX", "TKX");
      const tokenY = await tokenFactory.deploy("TokenY", "TKY");

      await tokenX.mint(signers.deployer.address, ethers.parseEther("10000000"));
      await tokenY.mint(signers.deployer.address, ethers.parseEther("10000000"));

      const largeAmount = ethers.parseEther("1000000");

      await fixture.factory.createPair(
        await tokenX.getAddress(),
        await tokenY.getAddress(),
        largeAmount,
        largeAmount * 2n,
      );

      const pairAddress = await fixture.factory.getPairAddress(
        await tokenX.getAddress(),
        await tokenY.getAddress(),
      );

      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should handle querying multiple pairs efficiently", async function () {
      // Create multiple pairs
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
      const tokens = [];
      for (let i = 0; i < 5; i++) {
        tokens.push(await tokenFactory.deploy(`Token${i}`, `TK${i}`));
      }

      // Create pairs
      for (let i = 0; i < tokens.length - 1; i++) {
        await fixture.factory.createPair(
          await tokens[i].getAddress(),
          await tokens[i + 1].getAddress(),
          ethers.parseEther("1000"),
          ethers.parseEther("2000"),
        );
      }

      // Query all pairs
      const pairs = [];
      for (let i = 0; i < tokens.length - 1; i++) {
        const pair = await fixture.factory.getPairAddress(
          await tokens[i].getAddress(),
          await tokens[i + 1].getAddress(),
        );
        pairs.push(pair);
        expect(pair).to.not.equal(ethers.ZeroAddress);
        expect(await fixture.factory.getIsPair(pair)).to.be.true;
      }

      // All pairs should be unique
      const uniquePairs = new Set(pairs);
      expect(uniquePairs.size).to.equal(pairs.length);
    });
  });
});




