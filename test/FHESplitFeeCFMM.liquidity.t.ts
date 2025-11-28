import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";

describe("FHESplitFeeCFMM - Liquidity", function () {
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

  describe("Add Liquidity", function () {
    it("Should add liquidity and mint LP tokens", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      // Encrypt amounts
      const amountAScaled = Number(amountA / ethers.parseEther("1"));
      const amountBScaled = Number(amountB / ethers.parseEther("1"));
      const encryptedAmountA = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(amountAScaled)
        .encrypt();
      const encryptedAmountB = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(amountBScaled)
        .encrypt();

      // Transfer tokens to pair
      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);

      const balanceBefore = await fixture.pair.balanceOf(signers.alice.address);

      await fixture.pair.connect(signers.alice).addLiquidity(
        encryptedAmountA.handles[0],
        encryptedAmountB.handles[0],
        encryptedAmountA.inputProof,
        encryptedAmountB.inputProof,
        signers.alice.address
      );

      const balanceAfter = await fixture.pair.balanceOf(signers.alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);

      const [reserveA, reserveB] = await fixture.pair.getReserves();
      expect(reserveA).to.equal(ethers.parseEther("11000"));
      expect(reserveB).to.equal(ethers.parseEther("22000"));
    });

    it("Should emit Mint event", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      // Encrypt amounts
      const amountAScaled = Number(amountA / ethers.parseEther("1"));
      const amountBScaled = Number(amountB / ethers.parseEther("1"));
      const encryptedAmountA = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(amountAScaled)
        .encrypt();
      const encryptedAmountB = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(amountBScaled)
        .encrypt();

      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);

      await expect(
        fixture.pair.connect(signers.alice).addLiquidity(
          encryptedAmountA.handles[0],
          encryptedAmountB.handles[0],
          encryptedAmountA.inputProof,
          encryptedAmountB.inputProof,
          signers.alice.address
        )
      )
        .to.emit(fixture.pair, "Mint")
        .withArgs(signers.alice.address, amountA, amountB);
    });

    it("Should handle multiple liquidity providers", async function () {
      const amountA1 = ethers.parseEther("1000");
      const amountB1 = ethers.parseEther("2000");

      // Encrypt amounts for Alice
      const encryptedAmountA1 = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(Number(amountA1 / ethers.parseEther("1")))
        .encrypt();
      const encryptedAmountB1 = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(Number(amountB1 / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.transfer(fixture.pairAddress, amountA1);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB1);
      await fixture.pair.connect(signers.alice).addLiquidity(
        encryptedAmountA1.handles[0],
        encryptedAmountB1.handles[0],
        encryptedAmountA1.inputProof,
        encryptedAmountB1.inputProof,
        signers.alice.address
      );

      const amountA2 = ethers.parseEther("500");
      const amountB2 = ethers.parseEther("1000");

      // Encrypt amounts for Bob
      const encryptedAmountA2 = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.bob.address)
        .add64(Number(amountA2 / ethers.parseEther("1")))
        .encrypt();
      const encryptedAmountB2 = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.bob.address)
        .add64(Number(amountB2 / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.transfer(fixture.pairAddress, amountA2);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB2);
      await fixture.pair.connect(signers.bob).addLiquidity(
        encryptedAmountA2.handles[0],
        encryptedAmountB2.handles[0],
        encryptedAmountA2.inputProof,
        encryptedAmountB2.inputProof,
        signers.bob.address
      );

      const aliceBalance = await fixture.pair.balanceOf(signers.alice.address);
      const bobBalance = await fixture.pair.balanceOf(signers.bob.address);

      expect(aliceBalance).to.be.gt(0n);
      expect(bobBalance).to.be.gt(0n);
    });
  });

  describe("Remove Liquidity", function () {
    beforeEach(async function () {
      // Add liquidity first
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");

      // Encrypt amounts
      const encryptedAmountA = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(Number(amountA / ethers.parseEther("1")))
        .encrypt();
      const encryptedAmountB = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add64(Number(amountB / ethers.parseEther("1")))
        .encrypt();

      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);
      await fixture.pair.connect(signers.alice).addLiquidity(
        encryptedAmountA.handles[0],
        encryptedAmountB.handles[0],
        encryptedAmountA.inputProof,
        encryptedAmountB.inputProof,
        signers.alice.address
      );
    });

    it("Should remove all liquidity", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      expect(liquidity).to.be.gt(0n);

      const reserveABefore = await fixture.pair.getReserveA();
      const reserveBBefore = await fixture.pair.getReserveB();

      await fixture.pair.connect(signers.alice).removeLiquidity(signers.alice.address);

      const balanceAfter = await fixture.pair.balanceOf(signers.alice.address);
      expect(balanceAfter).to.equal(0n);

      const reserveAAfter = await fixture.pair.getReserveA();
      const reserveBAfter = await fixture.pair.getReserveB();

      expect(reserveAAfter).to.be.lt(reserveABefore);
      expect(reserveBAfter).to.be.lt(reserveBBefore);
    });

    it("Should remove exact liquidity", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      const removeAmount = liquidity / 2n;

      await fixture.pair.connect(signers.alice).removeExactLiquidity(removeAmount, signers.alice.address);

      const balanceAfter = await fixture.pair.balanceOf(signers.alice.address);
      expect(balanceAfter).to.equal(liquidity - removeAmount);
    });

    it("Should emit Burn event", async function () {
      const liquidity = await fixture.pair.balanceOf(signers.alice.address);

      await expect(fixture.pair.connect(signers.alice).removeLiquidity(signers.alice.address)).to.emit(
        fixture.pair,
        "Burn",
      );
    });
  });
});

