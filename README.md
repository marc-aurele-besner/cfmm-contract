# CFMM Contract - FHEVM Implementation

A Hardhat-based project implementing Constant Function Market Maker (CFMM) contracts with Fully Homomorphic Encryption
(FHE) support using the FHEVM protocol by Zama. This project demonstrates how to build DeFi liquidity pools with
encrypted swap amounts and privacy-preserving features.

## 🎯 Overview

This project provides two implementations of a CFMM (Constant Function Market Maker) system:

1. **Standard CFMM** (`SplitFeeCFMM`, `SplitFeeFactory`, `MarketRouter`) - Traditional implementation
2. **FHE CFMM** (`FHESplitFeeCFMM`, `FHESplitFeeFactory`, `FHEMarketRouter`) - FHE-enabled implementation with encrypted
   swap amounts

### Key Features

- ✅ Constant Product Market Maker (x \* y = k)
- ✅ Liquidity provision and removal
- ✅ Token swaps with fee accumulation
- ✅ Split fee model (protocol fees + user fees)
- ✅ FHE support for encrypted swap amounts
- ✅ Router for multi-hop swaps
- ✅ Comprehensive test coverage

## 📋 Prerequisites

- **Node.js**: Version 20 or higher
- **npm**: Version 7.0.0 or higher
- Basic understanding of DeFi and AMM concepts

## 🚀 Quick Start

### Installation

1. **Clone the repository** (if applicable) or navigate to the project directory

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   # Set your mnemonic for test accounts
   npx hardhat vars set MNEMONIC

   # Set your Infura API key for network access
   npx hardhat vars set INFURA_API_KEY

   # Optional: Set Etherscan API key for contract verification
   npx hardhat vars set ETHERSCAN_API_KEY
   ```

### Compile Contracts

```bash
npm run compile
```

This will compile all Solidity contracts and generate TypeScript types.

### Run Tests

```bash
# Run all tests
npm run test

# Run tests on Sepolia testnet (requires deployment first)
npm run test:sepolia
```

The test suite includes:

- Unit tests for all contracts
- Integration tests for router functionality
- Complex scenario tests (arbitrage, MEV, flash loans, stress tests)
- Edge case and failure mode tests

## 📁 Project Structure

```
cfmm-contract/
├── contracts/                    # Smart contract source files
│   ├── SplitFeeCFMM.sol          # Standard CFMM pair contract
│   ├── SplitFeeFactory.sol        # Standard factory contract
│   ├── MarketRouter.sol           # Standard router contract
│   ├── FHESplitFeeCFMM.sol        # FHE-enabled CFMM pair contract
│   ├── FHESplitFeeFactory.sol     # FHE-enabled factory contract
│   ├── FHEMarketRouter.sol        # FHE-enabled router contract
│   ├── FHECounter.sol             # Example FHE counter contract
│   └── mocks/                     # Mock contracts for testing
│       ├── MockToken.sol          # ERC20 mock token
│       └── FlashLoanProvider.sol  # Flash loan provider for testing
├── test/                          # Test files
│   └──  helpers/                   # Test helper functions and fixtures
├── deploy/                        # Deployment scripts
├── tasks/                         # Hardhat custom tasks
├── hardhat.config.ts              # Hardhat configuration
└── package.json                   # Dependencies and scripts
```

## 📚 Contract Overview

### Standard Contracts

#### `SplitFeeCFMM`

A constant product market maker that manages liquidity pools for token pairs.

**Key Functions:**

- `addLiquidity(address to)` - Add liquidity to the pool
- `removeLiquidity(address to)` - Remove all liquidity
- `removeExactLiquidity(uint256 amount, address to)` - Remove specific amount of liquidity
- `swap(uint256 amountAOut, uint256 amountBOut, address to)` - Swap tokens
- `claimFees()` - Claim accumulated trading fees
- `getAmountOut(address tokenIn, uint256 amountIn)` - Calculate swap output

#### `SplitFeeFactory`

Factory contract for creating and managing CFMM pairs.

**Key Functions:**

- `createPair(address tokenA, address tokenB, uint256 amountA, uint256 amountB)` - Create a new pair
- `getPairAddress(address tokenA, address tokenB)` - Get pair address
- `getIsPair(address pair)` - Check if address is a valid pair

#### `MarketRouter`

Router contract for user-friendly token swaps and liquidity management.

**Key Functions:**

- `swapExactTokensForTokens(...)` - Swap exact input for minimum output
- `swapTokensForExactTokens(...)` - Swap maximum input for exact output
- `addLiquidity(...)` - Add liquidity through router
- `removeLiquidity(...)` - Remove liquidity through router
- `getAmountsOut(uint256 amountIn, address[] path)` - Calculate output amounts
- `getAmountsIn(uint256 amountOut, address[] path)` - Calculate input amounts

### FHE Contracts

The FHE versions (`FHESplitFeeCFMM`, `FHESplitFeeFactory`, `FHEMarketRouter`) provide the same functionality but with
support for encrypted swap amounts using FHEVM.

**Key Differences:**

- Swap functions accept encrypted swap amounts (`externalEuint32`)
- Encrypted accumulator tracks swap amounts homomorphically
- Requires FHE permissions for off-chain decryption

## 💻 Usage Examples

### Example 1: Deploy a Standard CFMM Pair

```typescript
import { ethers } from "hardhat";

async function deployPair() {
  // Deploy factory
  const Factory = await ethers.getContractFactory("SplitFeeFactory");
  const factory = await Factory.deploy(protocolFeeRecipientAddress);

  // Deploy tokens
  const TokenA = await ethers.getContractFactory("MockToken");
  const tokenA = await TokenA.deploy("TokenA", "TKA");
  const tokenB = await TokenA.deploy("TokenB", "TKB");

  // Create pair
  const tx = await factory.createPair(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    ethers.parseEther("10000"), // Initial amount A
    ethers.parseEther("20000"), // Initial amount B
  );
  await tx.wait();

  // Get pair address
  const pairAddress = await factory.getPairAddress(await tokenA.getAddress(), await tokenB.getAddress());

  console.log("Pair deployed at:", pairAddress);
}
```

### Example 2: Add Liquidity

```typescript
async function addLiquidity() {
  const pair = await ethers.getContractAt("SplitFeeCFMM", pairAddress);
  const tokenA = await ethers.getContractAt("MockToken", tokenAAddress);
  const tokenB = await ethers.getContractAt("MockToken", tokenBAddress);

  const amountA = ethers.parseEther("1000");
  const amountB = ethers.parseEther("2000");

  // Approve tokens
  await tokenA.approve(pairAddress, amountA);
  await tokenB.approve(pairAddress, amountB);

  // Transfer tokens to pair
  await tokenA.transfer(pairAddress, amountA);
  await tokenB.transfer(pairAddress, amountB);

  // Add liquidity
  const tx = await pair.addLiquidity(userAddress);
  await tx.wait();

  console.log("Liquidity added!");
}
```

### Example 3: Swap Tokens

```typescript
async function swapTokens() {
  const pair = await ethers.getContractAt("SplitFeeCFMM", pairAddress);
  const tokenB = await ethers.getContractAt("MockToken", tokenBAddress);

  const amountBIn = ethers.parseEther("100");
  const amountAOut = await pair.getAmountOut(tokenBAddress, amountBIn);

  // Approve and transfer input token
  await tokenB.approve(pairAddress, amountBIn);
  await tokenB.transfer(pairAddress, amountBIn);

  // Execute swap (getting tokenA out)
  const tx = await pair.swap(amountAOut, 0, recipientAddress);
  await tx.wait();

  console.log(`Swapped ${amountBIn} tokenB for ${amountAOut} tokenA`);
}
```

### Example 4: FHE Swap (Encrypted Amount)

```typescript
import { ethers, fhevm } from "hardhat";

async function fheSwap() {
  const pair = await ethers.getContractAt("FHESplitFeeCFMM", pairAddress);
  const tokenB = await ethers.getContractAt("MockToken", tokenBAddress);

  const swapAmount = 100; // Clear value to encrypt
  const amountAOut = ethers.parseEther("50"); // Clear output amount

  // Create encrypted input
  const encryptedInput = await fhevm.createEncryptedInput(pairAddress, userAddress).add32(swapAmount).encrypt();

  // Approve and transfer input token
  await tokenB.approve(pairAddress, ethers.parseEther("100"));
  await tokenB.transfer(pairAddress, ethers.parseEther("100"));

  // Execute swap with encrypted amount
  const tx = await pair.swap(
    encryptedInput.handles[0], // Encrypted swap amount
    encryptedInput.inputProof, // ZKPoK proof
    amountAOut, // Clear output amount
    0, // No tokenB output
    recipientAddress,
  );
  await tx.wait();

  console.log("FHE swap executed!");
}
```

### Example 5: Multi-hop Swap via Router

```typescript
async function multiHopSwap() {
  const router = await ethers.getContractAt("MarketRouter", routerAddress);
  const tokenA = await ethers.getContractAt("MockToken", tokenAAddress);

  const amountIn = ethers.parseEther("1000");
  const path = [tokenAAddress, tokenBAddress, tokenCAddress]; // A -> B -> C
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // Calculate output amount
  const amounts = await router.getAmountsOut(amountIn, path);
  const amountOutMin = (amounts[amounts.length - 1] * 95n) / 100n; // 5% slippage

  // Approve router
  await tokenA.approve(routerAddress, amountIn);

  // Execute swap
  const tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, path, recipientAddress, deadline);
  await tx.wait();

  console.log(`Swapped ${amountIn} tokenA for ${amounts[amounts.length - 1]} tokenC`);
}
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npx hardhat test test/SplitFeeCFMM.swap.t.ts

# Run tests with gas reporting
REPORT_GAS=true npm run test

# Run tests on Sepolia (requires deployment)
npm run test:sepolia
```

### Test Structure

Tests are organized by contract and functionality:

- **Deployment tests** - Verify contract initialization
- **Swap tests** - Test token swapping functionality
- **Liquidity tests** - Test adding/removing liquidity
- **Fee tests** - Test fee accumulation and claiming
- **Edge cases** - Test boundary conditions
- **Failure tests** - Test error conditions and reverts
- **Complex scenarios** - Arbitrage, MEV, flash loans, stress tests

### Writing Tests

Example test structure:

```typescript
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployFHEFixture } from "./helpers/fheFixtures";

describe("FHESplitFeeCFMM - Swap", function () {
  let fixture: FHEFixture;

  beforeEach(async function () {
    fixture = await loadFixture(deployFHEFixture);
  });

  it("Should swap tokens correctly", async function () {
    // Your test code here
  });
});
```

## 🚢 Deployment

### Local Network

1. **Start local Hardhat node**

   ```bash
   npm run chain
   ```

2. **Deploy contracts**

   ```bash
   npm run deploy:localhost
   ```

### Sepolia Testnet

1. **Deploy contracts**

   ```bash
   npm run deploy:sepolia
   ```

2. **Verify contracts on Etherscan**

   ```bash
   npm run verify:sepolia
   ```

### Custom Deployment Script

Create a deployment script in `deploy/`:

```typescript
import { HardhatRuntimeEnvironment } from "hardhat/types";

export default async function deploy(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Deploy factory
  await deploy("SplitFeeFactory", {
    from: deployer,
    args: [protocolFeeRecipient],
    log: true,
  });

  // Deploy router
  const factory = await deployments.get("SplitFeeFactory");
  await deploy("MarketRouter", {
    from: deployer,
    args: [factory.address],
    log: true,
  });
}
```

## 📜 Available Scripts

| Script                     | Description                                |
| -------------------------- | ------------------------------------------ |
| `npm run compile`          | Compile all contracts                      |
| `npm run test`             | Run all tests                              |
| `npm run test:sepolia`     | Run tests on Sepolia testnet               |
| `npm run coverage`         | Generate test coverage report              |
| `npm run lint`             | Run linting checks (Solidity + TypeScript) |
| `npm run prettier:write`   | Format code with Prettier                  |
| `npm run clean`            | Clean build artifacts and generated files  |
| `npm run chain`            | Start local Hardhat node                   |
| `npm run deploy:localhost` | Deploy to local network                    |
| `npm run deploy:sepolia`   | Deploy to Sepolia testnet                  |
| `npm run verify:sepolia`   | Verify contracts on Etherscan              |

## 🔧 Configuration

### Hardhat Configuration

The project uses Hardhat with the following key configurations:

- **Solidity**: Version 0.8.27
- **EVM Version**: Cancun
- **Optimizer**: Enabled (800 runs)
- **FHEVM Plugin**: Enabled for FHE contract support
- **TypeChain**: Generates TypeScript types for contracts

### Test Setup

The `test/setup.ts` file automatically suppresses FHEVM debug messages during tests. This is configured in
`hardhat.config.ts`:

```typescript
mocha: {
  require: ["./test/setup.ts"],
}
```

## 📖 Key Concepts

### Constant Product Market Maker

The CFMM uses the constant product formula: `x * y = k`, where:

- `x` = reserve of token A
- `y` = reserve of token B
- `k` = constant product

When swapping, the product must remain constant (minus fees).

### Fee Structure

- **Total Fee**: 0.25% (25 basis points)
- **Protocol Fee**: 0.05% (5 basis points)
- **User Fee**: 0.20% (20 basis points) - distributed to liquidity providers

### FHE Integration

The FHE contracts demonstrate:

- Encrypted swap amount inputs
- Homomorphic operations on encrypted values
- FHE permissions for off-chain decryption
- ZKPoK proofs for encrypted inputs

## 🐛 Troubleshooting

### Common Issues

1. **"HANDLE REVERT HERE!!" messages in tests**
   - This is normal FHEVM behavior during snapshot reverts
   - Already suppressed by `test/setup.ts`

2. **Type errors after compilation**
   - Run `npm run typechain` to regenerate types

3. **Tests failing on Sepolia**
   - Ensure contracts are deployed first
   - Check network configuration in `hardhat.config.ts`

4. **Gas estimation failures**
   - Ensure sufficient balance in test accounts
   - Check token approvals are set correctly

## 📚 Documentation

- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [FHEVM Hardhat Setup Guide](https://docs.zama.ai/protocol/solidity-guides/getting-started/setup)
- [FHEVM Testing Guide](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat/write_test)
- [FHEVM Hardhat Plugin](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat)

## 📄 License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/zama-ai/fhevm/issues)
- **Documentation**: [FHEVM Docs](https://docs.zama.ai)
- **Community**: [Zama Discord](https://discord.gg/zama)

---

**Built with ❤️ using FHEVM by Zama**
