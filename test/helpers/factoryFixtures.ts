import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { SplitFeeFactory, SplitFeeFactory__factory } from "../../types";
import { MockToken, MockToken__factory } from "../../types";
import { getSigners, type Signers } from "./fixtures";

export type FactoryFixture = {
  factory: SplitFeeFactory;
  tokenA: MockToken;
  tokenB: MockToken;
  tokenC: MockToken;
  tokenD: MockToken;
  tokenE: MockToken;
  tokenF: MockToken;
};

export async function deployFactoryFixture(): Promise<FactoryFixture> {
  const signers = await getSigners();
  const deployer = signers.deployer;

  // Deploy factory
  const factoryFactory = (await ethers.getContractFactory("SplitFeeFactory")) as SplitFeeFactory__factory;
  const factory = await factoryFactory.deploy(await signers.protocolFeeRecipient.getAddress());

  // Deploy mock tokens
  const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
  const tokenA = await tokenFactory.deploy("TokenA", "TKA");
  const tokenB = await tokenFactory.deploy("TokenB", "TKB");
  const tokenC = await tokenFactory.deploy("TokenC", "TKC");
  const tokenD = await tokenFactory.deploy("TokenD", "TKD");
  const tokenE = await tokenFactory.deploy("TokenE", "TKE");
  const tokenF = await tokenFactory.deploy("TokenF", "TKF");

  return {
    factory,
    tokenA,
    tokenB,
    tokenC,
    tokenD,
    tokenE,
    tokenF,
  };
}




