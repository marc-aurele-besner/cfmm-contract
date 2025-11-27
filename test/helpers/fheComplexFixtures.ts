import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { FHEMarketRouter, FHEMarketRouter__factory } from "../../types";
import { FHESplitFeeFactory, FHESplitFeeFactory__factory } from "../../types";
import { FHESplitFeeCFMM } from "../../types";
import { MockToken, MockToken__factory } from "../../types";
import { FlashLoanProvider, FlashLoanProvider__factory } from "../../types";
import { getFHESigners, type FHESigners } from "./fheFixtures";

export type FHEComplexFixture = {
  factory: FHESplitFeeFactory;
  router: FHEMarketRouter;
  flashLoanProvider: FlashLoanProvider;
  tokenA: MockToken;
  tokenB: MockToken;
  tokenC: MockToken;
  tokenD: MockToken;
  pairAB: FHESplitFeeCFMM;
  pairBC: FHESplitFeeCFMM;
  pairCD: FHESplitFeeCFMM;
  pairAC: FHESplitFeeCFMM;
};

export async function deployFHEComplexFixture(): Promise<FHEComplexFixture> {
  const signers = await getFHESigners();
  const deployer = signers.deployer;

  // Deploy FHE factory
  const factoryFactory = (await ethers.getContractFactory("FHESplitFeeFactory")) as FHESplitFeeFactory__factory;
  const factory = await factoryFactory.deploy(await signers.protocolFeeRecipient.getAddress());

  // Deploy FHE router
  const routerFactory = (await ethers.getContractFactory("FHEMarketRouter")) as FHEMarketRouter__factory;
  const router = await routerFactory.deploy(await factory.getAddress());

  // Deploy flash loan provider
  const flashLoanFactory = (await ethers.getContractFactory("FlashLoanProvider")) as FlashLoanProvider__factory;
  const flashLoanProvider = await flashLoanFactory.deploy();

  // Deploy mock tokens
  const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
  const tokenA = await tokenFactory.deploy("TokenA", "TKA");
  const tokenB = await tokenFactory.deploy("TokenB", "TKB");
  const tokenC = await tokenFactory.deploy("TokenC", "TKC");
  const tokenD = await tokenFactory.deploy("TokenD", "TKD");

  // Mint tokens to deployer
  await tokenA.mint(await deployer.getAddress(), ethers.parseEther("10000000"));
  await tokenB.mint(await deployer.getAddress(), ethers.parseEther("10000000"));
  await tokenC.mint(await deployer.getAddress(), ethers.parseEther("10000000"));
  await tokenD.mint(await deployer.getAddress(), ethers.parseEther("10000000"));

  // Create pairs with initial liquidity
  const amountA = ethers.parseEther("100000");
  const amountB = ethers.parseEther("200000");
  const amountC = ethers.parseEther("300000");
  const amountD = ethers.parseEther("400000");

  // Pair A-B
  await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress(), amountA, amountB);
  const pairABAddress = await factory.getPairAddress(await tokenA.getAddress(), await tokenB.getAddress());
  await tokenA.transfer(pairABAddress, amountA);
  await tokenB.transfer(pairABAddress, amountB);
  const pairAB = (await ethers.getContractAt("FHESplitFeeCFMM", pairABAddress)) as FHESplitFeeCFMM;

  // Pair B-C
  await factory.createPair(await tokenB.getAddress(), await tokenC.getAddress(), amountB, amountC);
  const pairBCAddress = await factory.getPairAddress(await tokenB.getAddress(), await tokenC.getAddress());
  await tokenB.transfer(pairBCAddress, amountB);
  await tokenC.transfer(pairBCAddress, amountC);
  const pairBC = (await ethers.getContractAt("FHESplitFeeCFMM", pairBCAddress)) as FHESplitFeeCFMM;

  // Pair C-D
  await factory.createPair(await tokenC.getAddress(), await tokenD.getAddress(), amountC, amountD);
  const pairCDAddress = await factory.getPairAddress(await tokenC.getAddress(), await tokenD.getAddress());
  await tokenC.transfer(pairCDAddress, amountC);
  await tokenD.transfer(pairCDAddress, amountD);
  const pairCD = (await ethers.getContractAt("FHESplitFeeCFMM", pairCDAddress)) as FHESplitFeeCFMM;

  // Pair A-C
  await factory.createPair(await tokenA.getAddress(), await tokenC.getAddress(), amountA, amountC);
  const pairACAddress = await factory.getPairAddress(await tokenA.getAddress(), await tokenC.getAddress());
  await tokenA.transfer(pairACAddress, amountA);
  await tokenC.transfer(pairACAddress, amountC);
  const pairAC = (await ethers.getContractAt("FHESplitFeeCFMM", pairACAddress)) as FHESplitFeeCFMM;

  // Fund flash loan provider
  await tokenA.mint(await flashLoanProvider.getAddress(), ethers.parseEther("1000000"));
  await tokenB.mint(await flashLoanProvider.getAddress(), ethers.parseEther("1000000"));
  await tokenC.mint(await flashLoanProvider.getAddress(), ethers.parseEther("1000000"));
  await tokenD.mint(await flashLoanProvider.getAddress(), ethers.parseEther("1000000"));

  return {
    factory,
    router,
    flashLoanProvider,
    tokenA,
    tokenB,
    tokenC,
    tokenD,
    pairAB,
    pairBC,
    pairCD,
    pairAC,
  };
}




