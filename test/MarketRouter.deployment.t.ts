import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, type Signers } from "./helpers/fixtures";
import { deployRouterFixture, type RouterFixture } from "./helpers/routerFixtures";

describe("MarketRouter - Deployment", function () {
  let signers: Signers;
  let fixture: RouterFixture;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    fixture = await deployRouterFixture();
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

