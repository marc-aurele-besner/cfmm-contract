import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, deployBasicFixture, type Signers, type BasicFixture } from "./helpers/fixtures";

describe("SplitFeeCFMM - Deployment", function () {
  let signers: Signers;
  let fixture: BasicFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployBasicFixture();
  });

  it("Should set correct token addresses", async function () {
    expect(await fixture.pair.getTokenA()).to.equal(await fixture.tokenA.getAddress());
    expect(await fixture.pair.getTokenB()).to.equal(await fixture.tokenB.getAddress());
  });

  it("Should set correct protocol fee recipient", async function () {
    expect(await fixture.pair.getProtocolFeeRecipient()).to.equal(signers.protocolFeeRecipient.address);
  });

  it("Should set initial reserves", async function () {
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    expect(reserveA).to.equal(ethers.parseEther("10000"));
    expect(reserveB).to.equal(ethers.parseEther("20000"));
  });

  it("Should mint LP tokens to contract", async function () {
    const totalSupply = await fixture.pair.totalSupply();
    expect(totalSupply).to.be.gt(0n);
  });

  it("Should handle getTokenA and getTokenB correctly", async function () {
    const tokenA = await fixture.pair.getTokenA();
    const tokenB = await fixture.pair.getTokenB();

    expect(tokenA).to.equal(await fixture.tokenA.getAddress());
    expect(tokenB).to.equal(await fixture.tokenB.getAddress());
    expect(tokenA).to.not.equal(tokenB);
  });

  it("Should handle getTotalLiquidity calculation", async function () {
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    const totalLiquidity = await fixture.pair.getTotalLiquidity();

    expect(totalLiquidity).to.equal(reserveA * reserveB);
  });

  it("Should maintain consistent reserves after deployment", async function () {
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    expect(reserveA).to.be.gt(0n);
    expect(reserveB).to.be.gt(0n);
    expect(reserveA).to.not.equal(reserveB);
  });

  it("Should have correct initial total supply", async function () {
    const totalSupply = await fixture.pair.totalSupply();
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    const expectedLiquidity = reserveA * reserveB;
    expect(totalSupply).to.equal(expectedLiquidity);
  });
});

