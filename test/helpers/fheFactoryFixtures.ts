import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { FHESplitFeeFactory, FHESplitFeeFactory__factory } from "../../types";
import { MockToken, MockToken__factory } from "../../types";
import { getFHESigners, type FHESigners } from "./fheFixtures";

export type FHEFactoryFixture = {
  factory: FHESplitFeeFactory;
  tokenA: MockToken;
  tokenB: MockToken;
  tokenC: MockToken;
  tokenD: MockToken;
  tokenE: MockToken;
  tokenF: MockToken;
};

export async function deployFHEFactoryFixture(): Promise<FHEFactoryFixture> {
  const signers = await getFHESigners();
  const deployer = signers.deployer;

  // Deploy FHE factory
  const factoryFactory = (await ethers.getContractFactory("FHESplitFeeFactory")) as FHESplitFeeFactory__factory;
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




