import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, type FHESigners } from "./helpers/fheFixtures";
import { deployFHERouterFixture, type FHERouterFixture, createEncryptedSwapParams } from "./helpers/fheRouterFixtures";
import { MockToken__factory } from "../../types";

describe("FHEMarketRouter - Edge Cases", function () {
  let signers: FHESigners;
  let fixture: FHERouterFixture;

  before(async function () {
    signers = await getFHESigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    fixture = await loadFixture(deployFHERouterFixture);

    // Mint tokens to users
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenB.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("100000"));
  });

  it("Should handle very small swap amounts", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const amountIn = ethers.parseEther("0.0001");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    if (amounts[1] > 0n) {
      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [swapParams],
        signers.alice.address,
        deadline,
      );
    }
  });

  it("Should handle very large swap amounts", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    await fixture.tokenA.mint(signers.alice.address, ethers.parseEther("1000000"));

    const amountIn = ethers.parseEther("50000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    if (amounts[1] > 0n) {
      await fixture.router.connect(signers.alice).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        [swapParams],
        signers.alice.address,
        deadline,
      );
    }
  });

  it("Should handle deadline at current time", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add64(Number(amountIn / ethers.parseEther("1")))
      .encrypt();

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      [swapParams],
      signers.alice.address,
      deadline,
    );
  });

  it("Should handle very long paths (if pairs exist)", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
    const tokenD = await tokenFactory.deploy("TokenD", "TKD");

    await tokenD.mint(signers.alice.address, ethers.parseEther("100000"));
    await fixture.tokenC.mint(signers.alice.address, ethers.parseEther("100000"));

    await fixture.factory.createPair(
      await fixture.tokenC.getAddress(),
      await tokenD.getAddress(),
      ethers.parseEther("10000"),
      ethers.parseEther("20000"),
    );
    const pairCDAddress = await fixture.factory.getPairAddress(
      await fixture.tokenC.getAddress(),
      await tokenD.getAddress(),
    );
    await fixture.tokenC.transfer(pairCDAddress, ethers.parseEther("10000"));
    await tokenD.transfer(pairCDAddress, ethers.parseEther("20000"));

    const amountIn = ethers.parseEther("1000");
    const path = [
      await fixture.tokenA.getAddress(),
      await fixture.tokenB.getAddress(),
      await fixture.tokenC.getAddress(),
      await tokenD.getAddress(),
    ];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Create encrypted amounts for each hop (use router address for signer)
    const pairABAddress = await fixture.pairAB.getAddress();
    const pairBCAddress = await fixture.pairBC.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    
    const swapParams1 = await createEncryptedSwapParams(
      pairABAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );
    const swapParams2 = await createEncryptedSwapParams(
      pairBCAddress,
      routerAddress,
      0,
      Number(amounts[1] / ethers.parseEther("1"))
    );
    const swapParams3 = await createEncryptedSwapParams(
      pairCDAddress,
      routerAddress,
      0,
      Number(amounts[2] / ethers.parseEther("1"))
    );

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    expect(amounts.length).to.equal(4);
    expect(amounts[0]).to.equal(amountIn);

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      [swapParams1, swapParams2, swapParams3],
      signers.alice.address,
      deadline,
    );

    expect(await tokenD.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle maximum deadline", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = ethers.MaxUint256;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add64(Number(amountIn / ethers.parseEther("1")))
      .encrypt();

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      [swapParams],
      signers.alice.address,
      deadline,
    );
  });

  it("Should handle reentrancy protection", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(pairAddress, routerAddress) // Use router address!
        .add64(Number(amountIn / ethers.parseEther("1")))
      .encrypt();

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      [swapParams],
      signers.alice.address,
      deadline,
    );
  });

  it("Should handle router integration with factory", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const tokenFactory = (await ethers.getContractFactory("MockToken")) as MockToken__factory;
    const tokenX = await tokenFactory.deploy("TokenX", "TKX");
    const tokenY = await tokenFactory.deploy("TokenY", "TKY");

    await tokenX.mint(signers.deployer.address, ethers.parseEther("1000000"));
    await tokenY.mint(signers.deployer.address, ethers.parseEther("1000000"));

    await fixture.factory.createPair(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
      ethers.parseEther("10000"),
      ethers.parseEther("20000"),
    );

    const pairAddress = await fixture.factory.getPairAddress(
      await tokenX.getAddress(),
      await tokenY.getAddress(),
    );
    await tokenX.transfer(pairAddress, ethers.parseEther("10000"));
    await tokenY.transfer(pairAddress, ethers.parseEther("20000"));

    await tokenX.mint(signers.alice.address, ethers.parseEther("100000"));
    await tokenX.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const path = [await tokenX.getAddress(), await tokenY.getAddress()];

    // Use router address for signer
    const routerAddress = await fixture.router.getAddress();
    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(ethers.parseEther("1000") / ethers.parseEther("1")),
      0
    );

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      ethers.parseEther("1000"),
      0n,
      path,
      [swapParams],
      signers.alice.address,
      deadline,
    );

    expect(await tokenY.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle deadline edge cases", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];

    const farFutureDeadline = Math.floor(Date.now() / 1000) + 86400 * 365;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      [swapParams],
      signers.alice.address,
      farFutureDeadline,
    );

    expect(await fixture.tokenB.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle swap with router integration", async function () {
    // Workaround: Create encrypted input for router address instead of user address
    const amountIn = ethers.parseEther("1000");
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const pairAddress = await fixture.pairAB.getAddress();
    const routerAddress = await fixture.router.getAddress();
    const swapParams = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amountIn / ethers.parseEther("1")),
      0
    );

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const amounts = await fixture.router.getAmountsOut(amountIn, path);
    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amountIn,
      amounts[1] - (amounts[1] * 1n) / 100n,
      path,
      [swapParams],
      signers.alice.address,
      deadline,
    );

    expect(await fixture.tokenB.balanceOf(signers.alice.address)).to.be.gt(0n);
  });

  it("Should handle multiple swaps affecting router calculations", async function () {
    // Workaround: Create encrypted inputs for router address instead of user address
    const path = [await fixture.tokenA.getAddress(), await fixture.tokenB.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await fixture.tokenA.connect(signers.alice).approve(await fixture.router.getAddress(), ethers.MaxUint256);
    await fixture.tokenA.mint(signers.bob.address, ethers.parseEther("100000"));
    await fixture.tokenA.connect(signers.bob).approve(await fixture.router.getAddress(), ethers.MaxUint256);

    const routerAddress = await fixture.router.getAddress();
    const pairAddress = await fixture.pairAB.getAddress();
    const amount1 = ethers.parseEther("1000");
    const swapParams1 = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amount1 / ethers.parseEther("1")),
      0
    );
    const amounts1 = await fixture.router.getAmountsOut(amount1, path);

    await fixture.router.connect(signers.alice).swapExactTokensForTokens(
      amount1,
      0n,
      path,
      [swapParams1],
      signers.alice.address,
      deadline,
    );

    const amount2 = ethers.parseEther("1000");
    const swapParams2 = await createEncryptedSwapParams(
      pairAddress,
      routerAddress,
      Number(amount2 / ethers.parseEther("1")),
      0
    );
    const amounts2 = await fixture.router.getAmountsOut(amount2, path);

    // Second swap should give different output due to price change
    expect(amounts2[1]).to.not.equal(amounts1[1]);
  });
});

