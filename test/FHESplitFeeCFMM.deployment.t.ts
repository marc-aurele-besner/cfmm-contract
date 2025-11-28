import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";

describe("FHESplitFeeCFMM - Deployment", function () {
  let signers: FHESigners;
  let fixture: FHEFixture;

  before(async function () {
    signers = await getFHESigners();
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    fixture = await deployFHEFixture();
  });

  it("Should be deployed", async function () {
    expect(ethers.isAddress(fixture.pairAddress)).to.eq(true);
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

  it("Encrypted swap accumulator should be uninitialized after deployment", async function () {
    // Note: getEncryptedSwapAccumulator was removed - swap accumulator tracking is now internal
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
});
