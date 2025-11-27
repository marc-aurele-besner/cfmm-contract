import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture } from "./helpers/fheRouterFixtures";

describe("FHEMarketRouter - Deployment", function () {
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

  it("Should set the correct factory address", async function () {
    expect(await fixture.router.factory()).to.equal(await fixture.factory.getAddress());
  });

  it("Should handle router factory reference correctly", async function () {
    const factoryAddress = await fixture.router.factory();
    expect(factoryAddress).to.equal(await fixture.factory.getAddress());
  });

  it("Should maintain immutable factory reference", async function () {
    const factory1 = await fixture.router.factory();
    const factory2 = await fixture.router.factory();
    expect(factory1).to.equal(factory2);
    expect(factory1).to.equal(await fixture.factory.getAddress());
  });
});




