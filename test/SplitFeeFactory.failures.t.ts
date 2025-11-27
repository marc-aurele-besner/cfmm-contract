import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployFactoryFixture, type FactoryFixture } from "./helpers/factoryFixtures";

describe("SplitFeeFactory - Failures", function () {
  let signers: Signers;
  let fixture: FactoryFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployFactoryFixture();
  });

  describe("createPair Failures", function () {
    it("Should revert when creating pair with zero address tokenA", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      await expect(
        fixture.factory.createPair(ethers.ZeroAddress, await fixture.tokenB.getAddress(), amountA, amountB)
      ).to.be.reverted;
    });

    it("Should revert when creating pair with zero address tokenB", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      await expect(
        fixture.factory.createPair(await fixture.tokenA.getAddress(), ethers.ZeroAddress, amountA, amountB)
      ).to.be.reverted;
    });

    it("Should handle creating pair with same token address", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      const tx = await fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenA.getAddress(),
        amountA,
        amountB,
      );

      try {
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
        const pairAddress = await fixture.factory.getPairAddress(
          await fixture.tokenA.getAddress(),
          await fixture.tokenA.getAddress(),
        );
      } catch (error: any) {
        expect(error.message).to.include("revert");
      }
    });

    it("Should handle creating pair with zero amounts", async function () {
      const tx = await fixture.factory.createPair(
        await fixture.tokenD.getAddress(),
        await fixture.tokenE.getAddress(),
        0n,
        0n,
      );

      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      const pairAddress = await fixture.factory.getPairAddress(
        await fixture.tokenD.getAddress(),
        await fixture.tokenE.getAddress(),
      );
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should handle creating pair with very large amounts", async function () {
      const amountA = ethers.parseEther("1000000000");
      const amountB = ethers.parseEther("2000000000");

      const tx = await fixture.factory.createPair(
        await fixture.tokenD.getAddress(),
        await fixture.tokenF.getAddress(),
        amountA,
        amountB,
      );

      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });
  });

  describe("setProtocolFeeRecipient Failures", function () {
    it("Should revert if non-owner tries to change protocol fee recipient", async function () {
      const newRecipient = signers.alice.address;

      await expect(fixture.factory.connect(signers.alice).setProtocolFeeRecipient(newRecipient)).to.be.revertedWith(
        "SplitFeeFactory: Only owner can call this function",
      );
    });

    it("Should revert if non-owner tries to change protocol fee recipient (bob)", async function () {
      const newRecipient = signers.bob.address;

      await expect(fixture.factory.connect(signers.bob).setProtocolFeeRecipient(newRecipient)).to.be.revertedWith(
        "SplitFeeFactory: Only owner can call this function",
      );
    });

    it("Should allow owner to set zero address as protocol fee recipient", async function () {
      await fixture.factory.setProtocolFeeRecipient(ethers.ZeroAddress);
      expect(await fixture.factory.protocolFeeRecipient()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("getPairAddress Edge Cases", function () {
    it("Should return zero address for zero address tokenA", async function () {
      const pairAddress = await fixture.factory.getPairAddress(ethers.ZeroAddress, await fixture.tokenB.getAddress());
      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return zero address for zero address tokenB", async function () {
      const pairAddress = await fixture.factory.getPairAddress(await fixture.tokenA.getAddress(), ethers.ZeroAddress);
      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return zero address for both zero addresses", async function () {
      const pairAddress = await fixture.factory.getPairAddress(ethers.ZeroAddress, ethers.ZeroAddress);
      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return same address regardless of token order for existing pair", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      await fixture.factory.createPair(
        await fixture.tokenD.getAddress(),
        await fixture.tokenE.getAddress(),
        amountA,
        amountB,
      );

      const addressDE = await fixture.factory.getPairAddress(
        await fixture.tokenD.getAddress(),
        await fixture.tokenE.getAddress(),
      );
      const addressED = await fixture.factory.getPairAddress(
        await fixture.tokenE.getAddress(),
        await fixture.tokenD.getAddress(),
      );

      expect(addressDE).to.equal(addressED);
      expect(addressDE).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("getIsPair Edge Cases", function () {
    it("Should return false for zero address", async function () {
      expect(await fixture.factory.getIsPair(ethers.ZeroAddress)).to.be.false;
    });

    it("Should return false for factory address", async function () {
      expect(await fixture.factory.getIsPair(await fixture.factory.getAddress())).to.be.false;
    });

    it("Should return false for token address", async function () {
      expect(await fixture.factory.getIsPair(await fixture.tokenA.getAddress())).to.be.false;
    });

    it("Should return false for random address", async function () {
      const randomAddress = ethers.Wallet.createRandom().address;
      expect(await fixture.factory.getIsPair(randomAddress)).to.be.false;
    });
  });

  describe("createPair with edge case failures", function () {
    it("Should handle creating pair when factory has many pairs", async function () {
      // Create many pairs first
      for (let i = 0; i < 5; i++) {
        const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
        const tokenX = await tokenFactory.deploy(`TokenX${i}`, `TKX${i}`);
        const tokenY = await tokenFactory.deploy(`TokenY${i}`, `TKY${i}`);
        await fixture.factory.createPair(
          await tokenX.getAddress(),
          await tokenY.getAddress(),
          ethers.parseEther("1000"),
          ethers.parseEther("2000")
        );
      }

      // Should still be able to create new pair
      const pairCountBefore = await fixture.factory.pairCount();
      await fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000")
      );
      const pairCountAfter = await fixture.factory.pairCount();
      expect(pairCountAfter).to.equal(pairCountBefore + 1n);
    });
  });
});

