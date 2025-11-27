import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployFactoryFixture, type FactoryFixture } from "./helpers/factoryFixtures";

describe("SplitFeeFactory - Pair Creation", function () {
  let signers: Signers;
  let fixture: FactoryFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployFactoryFixture();
  });

  it("Should create a new pair", async function () {
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");

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
    expect(await fixture.factory.pairCount()).to.equal(1n);

    const reversePairAddress = await fixture.factory.getPairAddress(
      await fixture.tokenB.getAddress(),
      await fixture.tokenA.getAddress(),
    );
    expect(reversePairAddress).to.equal(pairAddress);
    expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
  });

  it("Should create multiple pairs", async function () {
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");
    const amountC = ethers.parseEther("1500");

    await fixture.factory.createPair(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      amountA,
      amountB,
    );
    const pairABAddress = await fixture.factory.getPairAddress(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
    );

    await fixture.factory.createPair(
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      amountB,
      amountC,
    );
    const pairBCAddress = await fixture.factory.getPairAddress(
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
    );

    expect(await fixture.factory.pairCount()).to.equal(2n);
    expect(pairABAddress).to.not.equal(ethers.ZeroAddress);
    expect(pairBCAddress).to.not.equal(ethers.ZeroAddress);
    expect(pairABAddress).to.not.equal(pairBCAddress);
  });

  it("Should create many pairs with different token combinations", async function () {
    const amounts = {
      A: ethers.parseEther("1000"),
      B: ethers.parseEther("2000"),
      C: ethers.parseEther("1500"),
      D: ethers.parseEther("3000"),
      E: ethers.parseEther("2500"),
      F: ethers.parseEther("1800"),
    };

    const pairConfigs = [
      { token0: fixture.tokenA, token1: fixture.tokenB, amount0: amounts.A, amount1: amounts.B },
      { token0: fixture.tokenA, token1: fixture.tokenC, amount0: amounts.A, amount1: amounts.C },
      { token0: fixture.tokenA, token1: fixture.tokenD, amount0: amounts.A, amount1: amounts.D },
      { token0: fixture.tokenB, token1: fixture.tokenC, amount0: amounts.B, amount1: amounts.C },
      { token0: fixture.tokenB, token1: fixture.tokenD, amount0: amounts.B, amount1: amounts.D },
      { token0: fixture.tokenC, token1: fixture.tokenD, amount0: amounts.C, amount1: amounts.D },
      { token0: fixture.tokenD, token1: fixture.tokenE, amount0: amounts.D, amount1: amounts.E },
      { token0: fixture.tokenE, token1: fixture.tokenF, amount0: amounts.E, amount1: amounts.F },
    ];

    for (let i = 0; i < pairConfigs.length; i++) {
      const config = pairConfigs[i];
      await fixture.factory.createPair(
        await config.token0.getAddress(),
        await config.token1.getAddress(),
        config.amount0,
        config.amount1,
      );

      const pairAddress = await fixture.factory.getPairAddress(
        await config.token0.getAddress(),
        await config.token1.getAddress(),
      );

      expect(await fixture.factory.pairCount()).to.equal(BigInt(i + 1));
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
      expect(await fixture.factory.getIsPair(pairAddress)).to.be.true;
    }
  });

  it("Should handle creating pairs with same token order and reverse order", async function () {
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");

    await fixture.factory.createPair(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      amountA,
      amountB,
    );
    const pairAddress1 = await fixture.factory.getPairAddress(
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
    );

    const pairAddress2 = await fixture.factory.getPairAddress(
      await fixture.tokenB.getAddress(),
      await fixture.tokenA.getAddress(),
    );

    expect(pairAddress1).to.equal(pairAddress2);
    expect(await fixture.factory.pairCount()).to.equal(1n);
  });

  it("Should emit PairCreated event", async function () {
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");

    await expect(
      fixture.factory.createPair(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        amountA,
        amountB,
      ),
    )
      .to.emit(fixture.factory, "PairCreated")
      .withArgs(
        await fixture.tokenA.getAddress(),
        await fixture.tokenB.getAddress(),
        (value: string) => value !== ethers.ZeroAddress,
        1n,
        );
  });

  it("Should create pairs with different initial liquidity ratios", async function () {
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
    const tokenX = await tokenFactory.deploy("TokenX", "TKX");
    const tokenY = await tokenFactory.deploy("TokenY", "TKY");

    // Create pair with 1:1 ratio
    await fixture.factory.createPair(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
      ethers.parseEther("1000"),
      ethers.parseEther("1000")
    );

    const pairAddress1 = await fixture.factory.getPairAddress(
      await tokenX.getAddress(),
      await tokenY.getAddress()
    );
    expect(pairAddress1).to.not.equal(ethers.ZeroAddress);

    // Create another pair with different tokens and 1:10 ratio
    const tokenZ = await tokenFactory.deploy("TokenZ", "TKZ");
    await fixture.factory.createPair(
      await tokenX.getAddress(),
      await tokenZ.getAddress(),
      ethers.parseEther("1000"),
      ethers.parseEther("10000")
    );

    const pairAddress2 = await fixture.factory.getPairAddress(
      await tokenX.getAddress(),
      await tokenZ.getAddress()
    );
    expect(pairAddress2).to.not.equal(ethers.ZeroAddress);
    expect(pairAddress2).to.not.equal(pairAddress1);
  });

  it("Should handle creating pairs sequentially", async function () {
    const amounts = [ethers.parseEther("1000"), ethers.parseEther("2000"), ethers.parseEther("3000")];

    for (let i = 0; i < 3; i++) {
      const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
      const tokenX = await tokenFactory.deploy(`TokenX${i}`, `TKX${i}`);
      const tokenY = await tokenFactory.deploy(`TokenY${i}`, `TKY${i}`);

      await fixture.factory.createPair(
        await tokenX.getAddress(),
        await tokenY.getAddress(),
        amounts[i],
        amounts[i] * 2n
      );

      expect(await fixture.factory.pairCount()).to.equal(BigInt(i + 1));
    }
  });
});

