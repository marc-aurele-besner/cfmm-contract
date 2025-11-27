import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployFactoryFixture, type FactoryFixture } from "./helpers/factoryFixtures";

describe("SplitFeeFactory - Deployment", function () {
  let signers: Signers;
  let fixture: FactoryFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployFactoryFixture();
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

