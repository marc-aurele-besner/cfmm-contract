import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, deployBasicFixture, type Signers, type BasicFixture } from "./helpers/fixtures";
import { calculateInputForOutput } from "./helpers/calculations";
import { SplitFeeCFMM } from "../../types";

describe("SplitFeeCFMM - Edge Cases", function () {
  let signers: Signers;
  let fixture: BasicFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployBasicFixture();
  });

  it("Should handle swap with zero protocol fee recipient", async function () {
    // Create a new pair with zero protocol fee recipient
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as any;
    const tokenX = await tokenFactory.deploy("TokenX", "TKX");
    const tokenY = await tokenFactory.deploy("TokenY", "TKY");

    await tokenX.mint(signers.deployer.address, ethers.parseEther("1000000"));
    await tokenY.mint(signers.deployer.address, ethers.parseEther("1000000"));

    await fixture.factory.createPair(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
      ethers.parseEther("10000"),
      ethers.parseEther("20000"),
    );

    const pairAddress = await fixture.factory.getPairAddress(await tokenX.getAddress(), await tokenY.getAddress());
    await tokenX.transfer(pairAddress, ethers.parseEther("10000"));
    await tokenY.transfer(pairAddress, ethers.parseEther("20000"));

    const pair = (await ethers.getContractAt("SplitFeeCFMM", pairAddress)) as SplitFeeCFMM;
    const amountXOut = ethers.parseEther("100");
    const amountYIn = await calculateInputForOutput(
      await tokenX.getAddress(),
      amountXOut,
      await pair.getReserveB(),
      await pair.getReserveA(),
    );

    await tokenY.mint(signers.alice.address, amountYIn * 2n);
    await tokenY.connect(signers.alice).approve(pairAddress, amountYIn * 2n);

    await pair.connect(signers.alice).swap(amountXOut, 0n, signers.alice.address);

    expect(await tokenX.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should maintain constant product after fee accumulation", async function () {
    const [reserveABefore, reserveBBefore] = await fixture.pair.getReserves();
    const kBefore = reserveABefore * reserveBBefore;

    const amountAOut = ethers.parseEther("100");
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      await fixture.pair.getReserveB(),
      await fixture.pair.getReserveA(),
    );

    await fixture.tokenB.connect(signers.alice).approve(await fixture.pair.getAddress(), amountBIn * 2n);
    await fixture.pair.connect(signers.alice).swap(amountAOut, 0n, signers.alice.address);

    const [reserveAAfter, reserveBAfter] = await fixture.pair.getReserves();
    const kAfter = reserveAAfter * reserveBAfter;

    // Allow for small rounding differences (within 0.1%)
    const minK = (kBefore * 999n) / 1000n;
    expect(kAfter).to.be.gte(minK);
  });

  it("Should handle reserve synchronization after operations", async function () {
    const [reserveABefore, reserveBBefore] = await fixture.pair.getReserves();

    const amountAOut = ethers.parseEther("500");
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      await fixture.pair.getReserveB(),
      await fixture.pair.getReserveA(),
    );

    const balance = await fixture.tokenB.balanceOf(signers.alice.address);
    if (balance < amountBIn) {
      await fixture.tokenB.mint(signers.alice.address, amountBIn * 2n);
    }

    await fixture.tokenB.connect(signers.alice).approve(await fixture.pair.getAddress(), amountBIn * 2n);
    await fixture.pair.connect(signers.alice).swap(amountAOut, 0n, signers.alice.address);

    const [reserveAAfter, reserveBAfter] = await fixture.pair.getReserves();

    expect(reserveAAfter).to.equal(reserveABefore - amountAOut);
    expect(reserveBAfter).to.be.gt(reserveBBefore);
    expect(reserveAAfter).to.be.gt(0n);
    expect(reserveBAfter).to.be.gt(0n);
  });

  it("Should emit correct events for all operations", async function () {
    // Test Swap event
    const amountAOut = ethers.parseEther("100");
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      await fixture.pair.getReserveB(),
      await fixture.pair.getReserveA(),
    );

    const balance = await fixture.tokenB.balanceOf(signers.alice.address);
    if (balance < amountBIn) {
      await fixture.tokenB.mint(signers.alice.address, amountBIn * 2n);
    }

    await fixture.tokenB.connect(signers.alice).approve(await fixture.pair.getAddress(), amountBIn * 2n);

    await expect(fixture.pair.connect(signers.alice).swap(amountAOut, 0n, signers.alice.address)).to.emit(
      fixture.pair,
      "Swap",
    );

    // Test Mint event
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");
    await fixture.tokenA.transfer(await fixture.pair.getAddress(), amountA);
    await fixture.tokenB.transfer(await fixture.pair.getAddress(), amountB);

    await expect(fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address)).to.emit(
      fixture.pair,
      "Mint",
    );

    // Test Burn event
    const liquidity = await fixture.pair.balanceOf(signers.alice.address);
    if (liquidity > 0n) {
      await expect(
        fixture.pair.connect(signers.alice).removeExactLiquidity(liquidity / 2n, signers.alice.address),
      ).to.emit(fixture.pair, "Burn");
    }
  });
});

