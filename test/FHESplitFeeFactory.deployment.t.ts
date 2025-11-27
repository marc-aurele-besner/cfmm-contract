import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHEFactoryFixture, type FHEFactoryFixture } from "./helpers/fheFactoryFixtures";

describe("FHESplitFeeFactory - Deployment", function () {
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

  it("Should set the correct owner", async function () {
    expect(await fixture.factory.owner()).to.equal(signers.deployer.address);
  });

  it("Should set the correct protocol fee recipient", async function () {
    expect(await fixture.factory.protocolFeeRecipient()).to.equal(signers.protocolFeeRecipient.address);
  });

  it("Should start with zero pair count", async function () {
    expect(await fixture.factory.pairCount()).to.equal(0n);
  });

  it("Should maintain owner address consistency", async function () {
    const owner1 = await fixture.factory.owner();
    const owner2 = await fixture.factory.owner();
    expect(owner1).to.equal(owner2);
    expect(owner1).to.equal(signers.deployer.address);
  });

  it("Should maintain protocol fee recipient consistency", async function () {
    const recipient1 = await fixture.factory.protocolFeeRecipient();
    const recipient2 = await fixture.factory.protocolFeeRecipient();
    expect(recipient1).to.equal(recipient2);
    expect(recipient1).to.equal(signers.protocolFeeRecipient.address);
  });
});




