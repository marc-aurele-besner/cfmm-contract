import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { MarketRouter, MarketRouter__factory } from "../../types";
import { SplitFeeFactory, SplitFeeFactory__factory } from "../../types";
import { SplitFeeCFMM, SplitFeeCFMM__factory } from "../../types";
import { MockToken, MockToken__factory } from "../../types";
import { getSigners, type Signers } from "./fixtures";

export type RouterFixture = {
  factory: SplitFeeFactory;
  router: MarketRouter;
  tokenA: MockToken;
  tokenB: MockToken;
  tokenC: MockToken;
  pairAB: SplitFeeCFMM;
  pairBC: SplitFeeCFMM;
};

export async function deployRouterFixture(): Promise<RouterFixture> {
  const signers = await getSigners();
  const deployer = signers.deployer;

  // Deploy factory
  const factoryFactory = (await ethers.getContractFactory("SplitFeeFactory")) as SplitFeeFactory__factory;
  const factory = await factoryFactory.deploy(await signers.protocolFeeRecipient.getAddress());

  // Deploy router
  const routerFactory = (await ethers.getContractFactory("MarketRouter")) as MarketRouter__factory;
  const router = await routerFactory.deploy(await factory.getAddress());

  // Deploy mock tokens
  const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
  const tokenA = await tokenFactory.deploy("TokenA", "TKA");
  const tokenB = await tokenFactory.deploy("TokenB", "TKB");
  const tokenC = await tokenFactory.deploy("TokenC", "TKC");

  // Mint tokens to deployer
  await tokenA.mint(await deployer.getAddress(), ethers.parseEther("1000000"));
  await tokenB.mint(await deployer.getAddress(), ethers.parseEther("1000000"));
  await tokenC.mint(await deployer.getAddress(), ethers.parseEther("1000000"));

  // Create pair A-B
  await factory.createPair(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    ethers.parseEther("10000"),
    ethers.parseEther("20000"),
  );
  const pairABAddress = await factory.getPairAddress(await tokenA.getAddress(), await tokenB.getAddress());
  await tokenA.transfer(pairABAddress, ethers.parseEther("10000"));
  await tokenB.transfer(pairABAddress, ethers.parseEther("20000"));
  const pairAB = (await ethers.getContractAt("SplitFeeCFMM", pairABAddress)) as SplitFeeCFMM;

  // Create pair B-C
  await factory.createPair(
    await tokenB.getAddress(),
    await tokenC.getAddress(),
    ethers.parseEther("20000"),
    ethers.parseEther("30000"),
  );
  const pairBCAddress = await factory.getPairAddress(await tokenB.getAddress(), await tokenC.getAddress());
  await tokenB.transfer(pairBCAddress, ethers.parseEther("20000"));
  await tokenC.transfer(pairBCAddress, ethers.parseEther("30000"));
  const pairBC = (await ethers.getContractAt("SplitFeeCFMM", pairBCAddress)) as SplitFeeCFMM;

  return {
    factory,
    router,
    tokenA,
    tokenB,
    tokenC,
    pairAB,
    pairBC,
  };
}



