import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { FHESplitFeeCFMM, FHESplitFeeCFMM__factory } from "../../types";
import { MockToken, MockToken__factory } from "../../types";

export type FHESigners = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
  dave: HardhatEthersSigner;
  protocolFeeRecipient: HardhatEthersSigner;
};

export type FHEFixture = {
  tokenA: MockToken;
  tokenB: MockToken;
  pair: FHESplitFeeCFMM;
  pairAddress: string;
};

export async function getFHESigners(): Promise<FHESigners> {
  const ethSigners = await ethers.getSigners();
  return {
    deployer: ethSigners[0],
    alice: ethSigners[1],
    bob: ethSigners[2],
    charlie: ethSigners[3],
    dave: ethSigners[4],
    protocolFeeRecipient: ethSigners[5],
  };
}

export async function deployFHEFixture(): Promise<FHEFixture> {
  const signers = await getFHESigners();

  // Deploy mock tokens
  const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
  const tokenA = await tokenFactory.deploy("TokenA", "TKA");
  const tokenB = await tokenFactory.deploy("TokenB", "TKB");

  // Mint tokens
  await tokenA.mint(await signers.alice.getAddress(), ethers.parseEther("100000"));
  await tokenB.mint(await signers.alice.getAddress(), ethers.parseEther("100000"));
  await tokenA.mint(await signers.bob.getAddress(), ethers.parseEther("100000"));
  await tokenB.mint(await signers.bob.getAddress(), ethers.parseEther("100000"));

  // Deploy FHE pair
  const amountA = ethers.parseEther("10000");
  const amountB = ethers.parseEther("20000");

  const pairFactory = (await ethers.getContractFactory("FHESplitFeeCFMM")) as FHESplitFeeCFMM__factory;
  const pair = await pairFactory.deploy(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    await signers.protocolFeeRecipient.getAddress(),
    amountA,
    amountB,
    "PairAB",
    "PAB"
  );

  const pairAddress = await pair.getAddress();

  // Transfer tokens to pair for initial liquidity
  await tokenA.transfer(pairAddress, amountA);
  await tokenB.transfer(pairAddress, amountB);

  return {
    tokenA,
    tokenB,
    pair,
    pairAddress,
  };
}

