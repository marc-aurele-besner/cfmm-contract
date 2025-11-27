import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { MarketRouter, MarketRouter__factory } from "../../types";
import { SplitFeeFactory, SplitFeeFactory__factory } from "../../types";
import { SplitFeeCFMM } from "../../types";
import { MockToken, MockToken__factory } from "../../types";
import { FlashLoanProvider, FlashLoanProvider__factory } from "../../types";
import { getSigners, type Signers } from "./fixtures";

export type ComplexFixture = {
  factory: SplitFeeFactory;
  router: MarketRouter;
  flashLoanProvider: FlashLoanProvider;
  tokenA: MockToken;
  tokenB: MockToken;
  tokenC: MockToken;
  tokenD: MockToken;
  pairAB: SplitFeeCFMM;
  pairBC: SplitFeeCFMM;
  pairCD: SplitFeeCFMM;
  pairAC: SplitFeeCFMM;
};

export async function deployComplexFixture(): Promise<ComplexFixture> {
  const signers = await getSigners();
  const deployer = signers.deployer;

  // Deploy factory
  const factoryFactory = (await ethers.getContractFactory("SplitFeeFactory")) as SplitFeeFactory__factory;
  const factory = await factoryFactory.deploy(await signers.protocolFeeRecipient.getAddress());

  // Deploy router
  const routerFactory = (await ethers.getContractFactory("MarketRouter")) as MarketRouter__factory;
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
  const pairAB = (await ethers.getContractAt("SplitFeeCFMM", pairABAddress)) as SplitFeeCFMM;

  // Pair B-C
  await factory.createPair(await tokenB.getAddress(), await tokenC.getAddress(), amountB, amountC);
  const pairBCAddress = await factory.getPairAddress(await tokenB.getAddress(), await tokenC.getAddress());
  await tokenB.transfer(pairBCAddress, amountB);
  await tokenC.transfer(pairBCAddress, amountC);
  const pairBC = (await ethers.getContractAt("SplitFeeCFMM", pairBCAddress)) as SplitFeeCFMM;

  // Pair C-D
  await factory.createPair(await tokenC.getAddress(), await tokenD.getAddress(), amountC, amountD);
  const pairCDAddress = await factory.getPairAddress(await tokenC.getAddress(), await tokenD.getAddress());
  await tokenC.transfer(pairCDAddress, amountC);
  await tokenD.transfer(pairCDAddress, amountD);
  const pairCD = (await ethers.getContractAt("SplitFeeCFMM", pairCDAddress)) as SplitFeeCFMM;

  // Pair A-C
  await factory.createPair(await tokenA.getAddress(), await tokenC.getAddress(), amountA, amountC);
  const pairACAddress = await factory.getPairAddress(await tokenA.getAddress(), await tokenC.getAddress());
  await tokenA.transfer(pairACAddress, amountA);
  await tokenC.transfer(pairACAddress, amountC);
  const pairAC = (await ethers.getContractAt("SplitFeeCFMM", pairACAddress)) as SplitFeeCFMM;

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




