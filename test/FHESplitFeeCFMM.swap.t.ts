import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";
import { calculateInputForOutput } from "./helpers/calculations";

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

    // Encrypt swap amounts as euint64 (using a scaled value for demonstration)
    // Note: We need encrypted inputs for both A and B, even if one is zero
    const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1")); // Scale down for euint64
    const encryptedAmountBIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountBScaled)
      .encrypt();
    
    // For tokenA input, we use 0 since we're swapping B for A
    const encryptedAmountAIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    // Approve input token
    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);

    const reserveABefore = await fixture.pair.getReserveA();
    const reserveBBefore = await fixture.pair.getReserveB();

    // Perform swap with encrypted amounts
    const tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedAmountAIn.handles[0],
        encryptedAmountBIn.handles[0],
        encryptedAmountAIn.inputProof,
        encryptedAmountBIn.inputProof,
        amountAOut,
        0n,
        signers.alice.address
      );
    await tx.wait();

    const reserveAAfter = await fixture.pair.getReserveA();
    const reserveBAfter = await fixture.pair.getReserveB();

    expect(reserveAAfter).to.equal(reserveABefore - amountAOut);
    expect(reserveBAfter).to.be.gt(reserveBBefore);
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

    // Encrypt swap amounts
    const swapAmountAScaled = Number(amountAIn / ethers.parseEther("1"));
    const encryptedAmountAIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountAScaled)
      .encrypt();
    
    // For tokenB input, we use 0 since we're swapping A for B
    const encryptedAmountBIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    // Approve input token
    await fixture.tokenA.connect(signers.alice).approve(fixture.pairAddress, amountAIn * 2n);

    const reserveABefore = await fixture.pair.getReserveA();
    const reserveBBefore = await fixture.pair.getReserveB();

    // Perform swap
    const tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedAmountAIn.handles[0],
        encryptedAmountBIn.handles[0],
        encryptedAmountAIn.inputProof,
        encryptedAmountBIn.inputProof,
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
    const swapAmountBScaled1 = Number(amountBIn1 / ethers.parseEther("1"));
    const encryptedAmountBIn1 = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountBScaled1)
      .encrypt();
    
    const encryptedAmountAIn1 = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn1 * 2n);

    let tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedAmountAIn1.handles[0],
        encryptedAmountBIn1.handles[0],
        encryptedAmountAIn1.inputProof,
        encryptedAmountBIn1.inputProof,
        amountAOut1,
        0n,
        signers.alice.address
      );
    await tx.wait();

    // Second swap
    const [reserveA2, reserveB2] = await fixture.pair.getReserves();
    const amountAOut2 = ethers.parseEther("50");
    const amountBIn2 = await calculateInputForOutput(
      await fixture.tokenA.getAddress(),
      amountAOut2,
      reserveB2,
      reserveA2,
    );

    const swapAmountBScaled2 = Number(amountBIn2 / ethers.parseEther("1"));
    const encryptedAmountBIn2 = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountBScaled2)
      .encrypt();
    
    const encryptedAmountAIn2 = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    const balance = await fixture.tokenB.balanceOf(signers.alice.address);
    if (balance < amountBIn2) {
      await fixture.tokenB.mint(signers.alice.address, amountBIn2 * 2n);
    }

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn2 * 2n);

    tx = await fixture.pair
      .connect(signers.alice)
      .swap(
        encryptedAmountAIn2.handles[0],
        encryptedAmountBIn2.handles[0],
        encryptedAmountAIn2.inputProof,
        encryptedAmountBIn2.inputProof,
        amountAOut2,
        0n,
        signers.alice.address
      );
    await tx.wait();
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

    const swapAmountBScaled = Number(amountBIn / ethers.parseEther("1"));
    const encryptedAmountBIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(swapAmountBScaled)
      .encrypt();
    
    const encryptedAmountAIn = await fhevm
      .createEncryptedInput(fixture.pairAddress, signers.alice.address)
      .add64(0)
      .encrypt();

    await fixture.tokenB.connect(signers.alice).approve(fixture.pairAddress, amountBIn * 2n);

    await expect(
      fixture.pair
        .connect(signers.alice)
        .swap(
          encryptedAmountAIn.handles[0],
          encryptedAmountBIn.handles[0],
          encryptedAmountAIn.inputProof,
          encryptedAmountBIn.inputProof,
          amountAOut,
          0n,
          signers.alice.address
        )
    ).to.emit(fixture.pair, "Swap");
  });

});

