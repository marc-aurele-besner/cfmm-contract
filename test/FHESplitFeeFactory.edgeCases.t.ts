import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEFactoryFixture, type FHEFactoryFixture } from "./helpers/fheFactoryFixtures";

describe("FHESplitFeeFactory - Edge Cases", function () {
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

  it("Should handle pair creation with very small amounts", async function () {
    const amountA = ethers.parseEther("0.0001");
    const amountB = ethers.parseEther("0.0002");

    const tx = await fixture.factory.createPair(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      amountA,
      amountB,
    );

    const receipt = await tx.wait();
    expect(receipt).to.not.be.null;

    const pairAddress = await fixture.factory.getPairAddress(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
    );
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("Should handle pair creation with very large amounts", async function () {
    const amountA = ethers.parseEther("1000000");
    const amountB = ethers.parseEther("2000000");

    const tx = await fixture.factory.createPair(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      amountA,
      amountB,
    );

    const receipt = await tx.wait();
    expect(receipt).to.not.be.null;

    const pairAddress = await fixture.factory.getPairAddress(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
    );
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("Should handle creating pairs with different token combinations", async function () {
    const amounts = {
      A: ethers.parseEther("1000"),
      B: ethers.parseEther("2000"),
      C: ethers.parseEther("1500"),
      D: ethers.parseEther("3000"),
      E: ethers.parseEther("2500"),
      F: ethers.parseEther("1800"),
    };

    const tokens = [
      { name: "A", token: fixture.tokenA, amount: amounts.A },
      { name: "B", token: fixture.tokenB, amount: amounts.B },
      { name: "C", token: fixture.tokenC, amount: amounts.C },
      { name: "D", token: fixture.tokenD, amount: amounts.D },
      { name: "E", token: fixture.tokenE, amount: amounts.E },
      { name: "F", token: fixture.tokenF, amount: amounts.F },
    ];

    let expectedPairCount = 0;

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const token0 = tokens[i];
        const token1 = tokens[j];

        await fixture.factory.createPair(
          await token0.token.getAddress(),
          await token1.token.getAddress(),
          token0.amount,
          token1.amount,
        );

        expectedPairCount++;

        expect(await fixture.factory.pairCount()).to.equal(BigInt(expectedPairCount));

        const pairAddress = await fixture.factory.getPairAddress(
          await token0.token.getAddress(),
          await token1.token.getAddress(),
        );
        expect(pairAddress).to.not.equal(ethers.ZeroAddress);
        expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
      }
    }

    expect(await fixture.factory.pairCount()).to.equal(15n);
  });

  it("Should maintain correct pair count after multiple creations", async function () {
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");
    const amountC = ethers.parseEther("1500");
    const amountD = ethers.parseEther("3000");

    await fixture.factory.createPair(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      amountA,
      amountB,
    );
    expect(await fixture.factory.pairCount()).to.equal(1n);

    await fixture.factory.createPair(
      await fixture.tokenA.getAddress(),
      await fixture.tokenC.getAddress(),
      amountA,
      amountC,
    );
    expect(await fixture.factory.pairCount()).to.equal(2n);

    await fixture.factory.createPair(
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      amountB,
      amountC,
    );
    expect(await fixture.factory.pairCount()).to.equal(3n);

    await fixture.factory.createPair(
      await fixture.tokenC.getAddress(),
      await fixture.tokenD.getAddress(),
      amountC,
      amountD,
    );
    expect(await fixture.factory.pairCount()).to.equal(4n);
  });

  it("Should handle creating pairs with extreme ratios", async function () {
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
    const tokenX = await tokenFactory.deploy("TokenX", "TKX");
    const tokenY = await tokenFactory.deploy("TokenY", "TKY");

    // Create pair with very high ratio (1:10000)
    await fixture.factory.createPair(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
      ethers.parseEther("1"),
      ethers.parseEther("10000"),
    );

    const pairAddress = await fixture.factory.getPairAddress(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
    );
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("Should handle rapid pair creation", async function () {
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
    const tokens = [];
    for (let i = 0; i < 10; i++) {
      tokens.push(await tokenFactory.deploy(`Token${i}`, `TK${i}`));
    }

    // Create pairs rapidly
    for (let i = 0; i < tokens.length - 1; i++) {
      await fixture.factory.createPair(
        await tokens[i].getAddress(),
        await tokens[i + 1].getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
      );
    }

    expect(await fixture.factory.pairCount()).to.equal(BigInt(tokens.length - 1));
  });
});




