import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";
import { calculateInputForOutput } from "./helpers/calculations";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("FHESplitFeeCFMM - Swap", function () {
  let signers: FHESigners;
  let fixture: FHEFixture;

  before(async function () {
    signers = await getFHESigners();
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    fixture = await deployFHEFixture();
  });

  it("Should swap tokenB for tokenA using encrypted swap amount", async function () {
    const amountAOut = ethers.parseEther("100");
    const [reserveA, reserveB] = await fixture.pair.getReserves();

    // Calculate required input (tokenB)
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      reserveB,
      reserveA,
    );

    // Encrypt swap amount as euint32 (using a scaled value for demonstration)
    // Note: euint32 has limited range, so we use a scaled representation
    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1")); // Scale down for euint32
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled)
      .encrypt();

    // Approve input token
    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);

    const reserveABefore = await fixture.pair.getReserveA();
    const reserveBBefore = await fixture.pair.getReserveB();

    // Get encrypted accumulator before swap
    const encryptedAccumulatorBefore = await fixture.pair.getEncryptedSwapAccumulator();
    const clearAccumulatorBefore = encryptedAccumulatorBefore === ethers.ZeroHash 
      ? 0 
      : await fhevm.userDecryptEuint(
          FhevmType.euint32,
          encryptedAccumulatorBefore,
          fixture.pairAddress,
          signers.alice,
        );

    // Perform swap with encrypted amount
    const tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedSwapAmount.handles[0],
        encryptedSwapAmount.inputProof,
        amountAOut,
        0n,
        signers.alice.address
      );
    await tx.wait();

    const reserveAAfter = await fixture.pair.getReserveA();
    const reserveBAfter = await fixture.pair.getReserveB();

    expect(reserveAAfter).to.equal(reserveABefore - amountAOut);
    expect(reserveBAfter).to.be.gt(reserveBBefore);

    // Verify encrypted accumulator was updated
    const encryptedAccumulatorAfter = await fixture.pair.getEncryptedSwapAccumulator();
    const clearAccumulatorAfter = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedAccumulatorAfter,
      fixture.pairAddress,
      signers.alice,
    );

    expect(clearAccumulatorAfter).to.be.gt(clearAccumulatorBefore);
  });

  it("Should swap tokenA for tokenB using encrypted swap amount", async function () {
    const amountBOut = ethers.parseEther("200");
    const [reserveA, reserveB] = await fixture.pair.getReserves();

    // Calculate required input (tokenA)
    const amountAIn = await calculateInputForOutput(
      await fixture.tokenB.getAddress(),
      amountBOut,
      reserveA,
      reserveB,
    );

    // Encrypt swap amount
    const swapAmountScaled = Number(amountAIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled)
      .encrypt();

    // Approve input token
    await fixture.tokenA.connect(signers.alice).approve(fixture.pairAddress, amountAIn * 2n);

    const reserveABefore = await fixture.pair.getReserveA();
    const reserveBBefore = await fixture.pair.getReserveB();

    // Perform swap
    const tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedSwapAmount.handles[0],
        encryptedSwapAmount.inputProof,
        0n,
        amountBOut,
        signers.alice.address
      );
    await tx.wait();

    const reserveAAfter = await fixture.pair.getReserveA();
    const reserveBAfter = await fixture.pair.getReserveB();

    expect(reserveBAfter).to.equal(reserveBBefore - amountBOut);
    expect(reserveAAfter).to.be.gt(reserveABefore);
  });

  it("Should update encrypted accumulator with multiple swaps", async function () {
    const amountAOut1 = ethers.parseEther("50");
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    const amountBIn1 = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut1,
      reserveB,
      reserveA,
    );

    // First swap
    const swapAmountScaled1 = Number(amountBIn1 / ethers.parseEther("1"));
    const encryptedSwapAmount1 = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled1)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn1 * 2n);

    let tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedSwapAmount1.handles[0],
        encryptedSwapAmount1.inputProof,
        amountAOut1,
        0n,
        signers.alice.address
      );
    await tx.wait();

    const encryptedAccumulatorAfter1 = await fixture.pair.getEncryptedSwapAccumulator();
    const clearAccumulatorAfter1 = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedAccumulatorAfter1,
      fixture.pairAddress,
      signers.alice,
    );

    // Second swap
    const [reserveA2, reserveB2] = await fixture.pair.getReserves();
    const amountAOut2 = ethers.parseEther("50");
    const amountBIn2 = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut2,
      reserveB2,
      reserveA2,
    );

    const swapAmountScaled2 = Number(amountBIn2 / ethers.parseEther("1"));
    const encryptedSwapAmount2 = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled2)
      .encrypt();

    const balance = await fixture.tokenB.balanceOf(signers.alice.address);
    if (balance < amountBIn2) {
      await fixture.tokenB.mint(signers.alice.address, amountBIn2 * 2n);
    }

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn2 * 2n);

    tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedSwapAmount2.handles[0],
        encryptedSwapAmount2.inputProof,
        amountAOut2,
        0n,
        signers.alice.address
      );
    await tx.wait();

    const encryptedAccumulatorAfter2 = await fixture.pair.getEncryptedSwapAccumulator();
    const clearAccumulatorAfter2 = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedAccumulatorAfter2,
      fixture.pairAddress,
      signers.alice,
    );

    // Accumulator should have increased
    expect(clearAccumulatorAfter2).to.be.gt(clearAccumulatorAfter1);
  });

  it("Should emit Swap event", async function () {
    const amountAOut = ethers.parseEther("100");
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      reserveB,
      reserveA,
    );

    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);

    await expect(
      fixture.pair
        .connect(signers.alice)
        .swap(
          encryptedSwapAmount.handles[0],
          encryptedSwapAmount.inputProof,
          amountAOut,
          0n,
          signers.alice.address
        )
    ).to.emit(fixture.pair, "Swap");
  });

  it("Should emit EncryptedSwapAccumulatorUpdated event", async function () {
    const amountAOut = ethers.parseEther("100");
    const [reserveA, reserveB] = await fixture.pair.getReserves();
    const amountBIn = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut,
      reserveB,
      reserveA,
    );

    const swapAmountScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedSwapAmount = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add32(swapAmountScaled)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);

    await expect(
      fixture.pair
        .connect(signers.alice)
        .swap(
          encryptedSwapAmount.handles[0],
          encryptedSwapAmount.inputProof,
          amountAOut,
          0n,
          signers.alice.address
        )
    ).to.emit(fixture.pair, "EncryptedSwapAccumulatorUpdated");
  });
});

