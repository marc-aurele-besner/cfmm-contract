import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { getFHESigners, deployFHEFixture, type FHESigners, type FHEFixture } from "./helpers/fheFixtures";
import { calculateInputForOutput } from "./helpers/calculations";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("FHESplitFeeCFMM - Failures", function () {
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

  describe("Swap Failures", function () {
    it("Should revert swap with zero output", async function () {
      // Create encrypted zero value
      const encryptedZero = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add32(0)
        .encrypt();

      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(encryptedZero.handles[0], encryptedZero.inputProof, 0n, 0n, signers.alice.address)
      ).to.be.revertedWith("FHESplitFeeCFMM: Insufficient output amount");
    });

    it("Should revert swap with both outputs", async function () {
      const encryptedAmount = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add32(100)
        .encrypt();

      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(
            encryptedAmount.handles[0],
            encryptedAmount.inputProof,
            ethers.parseEther("100"),
            ethers.parseEther("200"),
            signers.alice.address
          )
      ).to.be.revertedWith("FHESplitFeeCFMM: Cannot swap both tokens");
    });

    it("Should revert swap with invalid recipient (tokenA address)", async function () {
      const amountAOut = ethers.parseEther("100");
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
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
            await fixture.tokenA.getAddress()
          )
      ).to.be.revertedWith("FHESplitFeeCFMM: Invalid recipient");
    });

    it("Should revert swap with invalid recipient (tokenB address)", async function () {
      const amountBOut = ethers.parseEther("200");
      const amountAIn = await calculateInputForOutput(
        await fixture.tokenB.getAddress(),
        amountBOut,
        await fixture.pair.getReserveA(),
        await fixture.pair.getReserveB(),
      );

      const swapAmountScaled = Number(amountAIn / ethers.parseEther("1"));
      const encryptedSwapAmount = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add32(swapAmountScaled)
        .encrypt();

      await fixture.tokenA.connect(signers.alice).approve(fixture.pairAddress, amountAIn * 2n);

      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(
            encryptedSwapAmount.handles[0],
            encryptedSwapAmount.inputProof,
            0n,
            amountBOut,
            await fixture.tokenB.getAddress()
          )
      ).to.be.revertedWith("FHESplitFeeCFMM: Invalid recipient");
    });

    it("Should revert swap with insufficient reserves (amountAOut too large)", async function () {
      const [reserveA] = await fixture.pair.getReserves();
      const amountAOut = reserveA + ethers.parseEther("1");

      const encryptedAmount = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add32(100)
        .encrypt();

      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(encryptedAmount.handles[0], encryptedAmount.inputProof, amountAOut, 0n, signers.alice.address)
      ).to.be.revertedWith("FHESplitFeeCFMM: Insufficient reserveA");
    });

    it("Should revert swap with insufficient reserves (amountBOut too large)", async function () {
      const [, reserveB] = await fixture.pair.getReserves();
      const amountBOut = reserveB + ethers.parseEther("1");

      const encryptedAmount = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add32(100)
        .encrypt();

      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(encryptedAmount.handles[0], encryptedAmount.inputProof, 0n, amountBOut, signers.alice.address)
      ).to.be.revertedWith("FHESplitFeeCFMM: Insufficient reserveB");
    });

    it("Should revert swap with insufficient token balance", async function () {
      const amountAOut = ethers.parseEther("100");

      const encryptedAmount = await fhevm
        .createEncryptedInput(fixture.pairAddress, signers.alice.address)
        .add32(100)
        .encrypt();

      await expect(
        fixture.pair
          .connect(signers.alice)
          .swap(encryptedAmount.handles[0], encryptedAmount.inputProof, amountAOut, 0n, signers.alice.address)
      ).to.be.reverted;
    });

    it("Should revert swap with zero address recipient", async function () {
      const amountAOut = ethers.parseEther("100");
      const amountBIn = await calculateInputForOutput(
        await fixture.tokenA.getAddress(),
        amountAOut,
        await fixture.pair.getReserveB(),
        await fixture.pair.getReserveA(),
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
          .swap(encryptedSwapAmount.handles[0], encryptedSwapAmount.inputProof, amountAOut, 0n, ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe("Add Liquidity Failures", function () {
    it("Should revert add liquidity with zero tokenA amount", async function () {
      const amountB = ethers.parseEther("2000");
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address)).to.be.revertedWith(
        "FHESplitFeeCFMM: Insufficient amounts",
      );
    });

    it("Should revert add liquidity with zero tokenB amount", async function () {
      const amountA = ethers.parseEther("1000");
      await fixture.tokenA.transfer(fixture.pairAddress, amountA);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address)).to.be.revertedWith(
        "FHESplitFeeCFMM: Insufficient amounts",
      );
    });

    it("Should revert add liquidity with zero address recipient", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);

      await expect(fixture.pair.connect(signers.alice).addLiquidity(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("Remove Liquidity Failures", function () {
    it("Should revert remove liquidity with zero balance", async function () {
      await expect(fixture.pair.connect(signers.bob).removeLiquidity(signers.bob.address)).to.be.revertedWith(
        "FHESplitFeeCFMM: Insufficient liquidity",
      );
    });

    it("Should revert removeExactLiquidity with zero amount", async function () {
      await expect(
        fixture.pair.connect(signers.alice).removeExactLiquidity(0n, signers.alice.address),
      ).to.be.revertedWith("FHESplitFeeCFMM: Insufficient liquidity");
    });

    it("Should revert removeExactLiquidity with insufficient balance", async function () {
      // Add liquidity first
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);
      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      const excessAmount = liquidity + ethers.parseEther("1");

      await expect(
        fixture.pair.connect(signers.alice).removeExactLiquidity(excessAmount, signers.alice.address),
      ).to.be.revertedWith("FHESplitFeeCFMM: Insufficient balance");
    });

    it("Should revert remove liquidity with zero address recipient", async function () {
      // Add liquidity first
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);
      await fixture.pair.connect(signers.alice).addLiquidity(signers.alice.address);

      const liquidity = await fixture.pair.balanceOf(signers.alice.address);
      if (liquidity > 0n) {
        await expect(fixture.pair.connect(signers.alice).removeExactLiquidity(liquidity, ethers.ZeroAddress)).to.be
          .reverted;
      }
    });
  });

  describe("Claim Fees Failures", function () {
    it("Should revert claim fees with no liquidity", async function () {
      await expect(fixture.pair.connect(signers.bob).claimFees()).to.be.revertedWith(
        "FHESplitFeeCFMM: No liquidity to claim fees from",
      );
    });

    it("Should revert claim fees when no fees available", async function () {
      // Add liquidity but don't perform any swaps to generate fees
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("2000");
      await fixture.tokenA.transfer(fixture.pairAddress, amountA);
      await fixture.tokenB.transfer(fixture.pairAddress, amountB);
      await fixture.pair.connect(signers.bob).addLiquidity(signers.bob.address);

      await expect(fixture.pair.connect(signers.bob).claimFees()).to.be.revertedWith(
        "FHESplitFeeCFMM: No fees to claim",
      );
    });
  });

  describe("getAmountOut Failures", function () {
    it("Should revert for invalid token", async function () {
      const invalidToken = await (await ethers.getContractFactory("MockToken")).deploy("Invalid", "INV");
      const amountIn = ethers.parseEther("1000");

      await expect(fixture.pair.getAmountOut(await invalidToken.getAddress(), amountIn)).to.be.revertedWith(
        "FHESplitFeeCFMM: Invalid token",
      );
    });

    it("Should revert for zero input amount", async function () {
      await expect(fixture.pair.getAmountOut(await fixture.tokenA.getAddress(), 0n)).to.be.revertedWith(
        "FHESplitFeeCFMM: Insufficient input amount",
      );
    });

    it("Should revert for zero address token", async function () {
      const amountIn = ethers.parseEther("1000");
      await expect(fixture.pair.getAmountOut(ethers.ZeroAddress, amountIn)).to.be.revertedWith(
        "FHESplitFeeCFMM: Invalid token",
      );
    });
  });
});




