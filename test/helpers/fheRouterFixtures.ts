import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { FHEMarketRouter, FHEMarketRouter__factory } from "../../types";
import { FHESplitFeeFactory, FHESplitFeeFactory__factory } from "../../types";
import { FHESplitFeeCFMM, FHESplitFeeCFMM__factory } from "../../types";
import { MockToken, MockToken__factory } from "../../types";
import { getFHESigners, type FHESigners } from "./fheFixtures";

export type FHERouterFixture = {
  factory: FHESplitFeeFactory;
  router: FHEMarketRouter;
  tokenA: MockToken;
  tokenB: MockToken;
  tokenC: MockToken;
  pairAB: FHESplitFeeCFMM;
  pairBC: FHESplitFeeCFMM;
};

export async function deployFHERouterFixture(): Promise<FHERouterFixture> {
  const signers = await getFHESigners();
  const deployer = signers.deployer;

  // Deploy FHE factory
  const factoryFactory = (await ethers.getContractFactory("FHESplitFeeFactory")) as FHESplitFeeFactory__factory;
  const factory = await factoryFactory.deploy(await signers.protocolFeeRecipient.getAddress());

  // Deploy FHE router
  const routerFactory = (await ethers.getContractFactory("FHEMarketRouter")) as FHEMarketRouter__factory;
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
  const pairAB = (await ethers.getContractAt("FHESplitFeeCFMM", pairABAddress)) as FHESplitFeeCFMM;

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
  const pairBC = (await ethers.getContractAt("FHESplitFeeCFMM", pairBCAddress)) as FHESplitFeeCFMM;

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




