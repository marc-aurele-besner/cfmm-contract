import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { SplitFeeCFMM, SplitFeeCFMM__factory } from "../../types";
import { SplitFeeFactory, SplitFeeFactory__factory } from "../../types";
import { MockToken, MockToken__factory } from "../../types";

export type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie?: HardhatEthersSigner;
  dave?: HardhatEthersSigner;
  protocolFeeRecipient: HardhatEthersSigner;
};

export type BasicFixture = {
  factory: SplitFeeFactory;
  tokenA: MockToken;
  tokenB: MockToken;
  pair: SplitFeeCFMM;
};

export type ExtendedFixture = BasicFixture & {
  tokenC: MockToken;
  tokenD?: MockToken;
};

export async function getSigners(): Promise<Signers> {
  const ethSigners = await ethers.getSigners();
  return {
    deployer: ethSigners[0],
    alice: ethSigners[1],
    bob: ethSigners[2],
    charlie: ethSigners[3],
    dave: ethSigners[4],
    protocolFeeRecipient: ethSigners[5] || ethSigners[3],
  };
}

export async function deployBasicFixture(): Promise<BasicFixture> {
  const signers = await getSigners();

  // Deploy factory
  const factoryFactory = (await ethers.getContractFactory("SplitFeeFactory")) as SplitFeeFactory__factory;
  const factory = await factoryFactory.deploy(await signers.protocolFeeRecipient.getAddress());

  // Deploy mock tokens
  const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
  const tokenA = await tokenFactory.deploy("TokenA", "TKA");
  const tokenB = await tokenFactory.deploy("TokenB", "TKB");

  // Mint tokens to Alice and Bob for swapping
  await tokenA.mint(await signers.alice.getAddress(), ethers.parseEther("100000"));
  await tokenB.mint(await signers.alice.getAddress(), ethers.parseEther("100000"));
  await tokenA.mint(await signers.bob.getAddress(), ethers.parseEther("100000"));
  await tokenB.mint(await signers.bob.getAddress(), ethers.parseEther("100000"));

  // Create initial pair with liquidity
  const amountA = ethers.parseEther("10000");
  const amountB = ethers.parseEther("20000");

  // Create pair
  const tx = await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress(), amountA, amountB);
  await tx.wait();
  const pairAddress = await factory.getPairAddress(await tokenA.getAddress(), await tokenB.getAddress());

  // Transfer tokens to pair (needed for initial liquidity)
  await tokenA.transfer(pairAddress, amountA);
  await tokenB.transfer(pairAddress, amountB);

  const pairFactory = (await ethers.getContractFactory("SplitFeeCFMM")) as SplitFeeCFMM__factory;
  const pair = pairFactory.attach(pairAddress) as SplitFeeCFMM;

  return {
    factory,
    tokenA,
    tokenB,
    pair,
  };
}

export async function deployExtendedFixture(): Promise<ExtendedFixture> {
  const basic = await deployBasicFixture();
  const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
  const tokenC = await tokenFactory.deploy("TokenC", "TKC");

  return {
    ...basic,
    tokenC,
  };
}



