// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHESplitFeeCFMM
 * @author Marc-Aurèle Besner (marc-aurele-besner)
 * @notice FHESplitFeeCFMM manages DeFi liquidity with Fully Homomorphic Encryption support.
 * This contract demonstrates FHE integration following Zama FHEVM guidelines.
 * @dev This is a simplified FHE version demonstrating the pattern. Full CFMM implementation
 *      with FHE requires complex off-chain workflows for decryption/encryption of large values.
 *      Core Concepts:
 *      - Encrypted Swap Amounts: Swap inputs are encrypted off-chain and verified via ZKPoK
 *      - FHE Operations: Uses FHE.add and FHE.sub for encrypted calculations
 *      - FHE Permissions: Required for off-chain decryption of encrypted values
 *      Note: Reserves are kept as clear values for token transfers, but swap amounts can be encrypted.
 *
**/

contract FHESplitFeeCFMM is ERC20, ReentrancyGuard, ZamaEthereumConfig {
    // Tokens associated with the pair
    address public tokenA;
    address public tokenB;
    // Address of the protocol fee recipient
    address public protocolFeeRecipient;
    // Reserves of the tokens in the pair (kept as clear values for token transfers)
    uint256 public reserveA;
    uint256 public reserveB;
    // Encrypted swap amount accumulator (demonstrates FHE storage)
    euint32 private _encryptedSwapAccumulator;
    // Fees configuration
    uint256 public constant TOTAL_FEE_BPS = 25;     // 0.25% Total fee (protocol + user)
    uint256 public constant PROTOCOL_FEE_BPS = 5;   // 0.05% Protocol fee
    uint256 public constant MINIMUM_LIQUIDITY = 10**3; // Minimum liquidity required
    uint256 public constant ACC_PRECISION = 1e36; 
    // Fee accumulated in the pool
    uint256 public accumulatedTokenAFeePerShare;
    uint256 public accumulatedTokenBFeePerShare;

    struct UserInfo {
        uint256 rewardDebtA;
        uint256 rewardDebtB;
    }
    
    // Mapping of user to their user info
    mapping(address => UserInfo) public userInfo;

    // Events
    event Swap(
        address indexed sender, 
        uint256 amountAIn, 
        uint256 amountBIn, 
        uint256 amountAOut, 
        uint256 amountBOut, 
        address indexed to
    );
    event Mint(address indexed sender, uint256 amountA, uint256 amountB);
    event Burn(address indexed sender, uint256 amountA, uint256 amountB, address indexed to);
    event Sync(uint256 reserveA, uint256 reserveB);
    event FeesClaimed(address indexed user, uint256 amountA, uint256 amountB);
    event EncryptedSwapAccumulatorUpdated(euint32 newValue);

    constructor(
        address _tokenA, 
        address _tokenB, 
        address _protocolFeeRecipient, 
        uint256 _amountA, 
        uint256 _amountB,
        string memory _pairName,
        string memory _pairSymbol
    ) 
        ERC20(_pairName, _pairSymbol)
    {
        tokenA = _tokenA;
        tokenB = _tokenB;
        protocolFeeRecipient = _protocolFeeRecipient;

        reserveA = _amountA;
        reserveB = _amountB;

        _mint(address(this), _amountA * _amountB);
    }

    /**
     * @notice Swap tokens using encrypted swap amount (demonstrates FHE pattern)
     * @param _encryptedSwapAmount Encrypted swap amount (euint32 for demonstration)
     * @param _swapAmountProof ZKPoK proof for encrypted swap amount
     * @param _amountAOut Clear amount of tokenA to output
     * @param _amountBOut Clear amount of tokenB to output
     * @param _to Recipient address
     * @dev This demonstrates FHE integration - the swap amount is encrypted but
     *      actual swap uses clear values for token transfers. In production, you'd
     *      decrypt the encrypted amount off-chain after granting permissions.
     */
    function swap(
        externalEuint32 _encryptedSwapAmount,
        bytes calldata _swapAmountProof,
        uint256 _amountAOut,
        uint256 _amountBOut,
        address _to
    ) external nonReentrant {
        require(_amountAOut > 0 || _amountBOut > 0, "FHESplitFeeCFMM: Insufficient output amount");
        require(_amountAOut == 0 || _amountBOut == 0, "FHESplitFeeCFMM: Cannot swap both tokens");
        require(_to != tokenA && _to != tokenB, "FHESplitFeeCFMM: Invalid recipient");
        
        // Convert external encrypted value to internal euint32
        euint32 encryptedSwapAmount = FHE.fromExternal(_encryptedSwapAmount, _swapAmountProof);
        
        // Update encrypted accumulator using FHE operation
        _encryptedSwapAccumulator = FHE.add(_encryptedSwapAccumulator, encryptedSwapAmount);
        
        // Grant FHE permissions for off-chain decryption
        FHE.allowThis(_encryptedSwapAccumulator);
        FHE.allow(_encryptedSwapAccumulator, msg.sender);
        
        emit EncryptedSwapAccumulatorUpdated(_encryptedSwapAccumulator);
        
        // Perform actual swap with clear values (for token transfers)
        (uint256 amountAIn, uint256 amountBIn) = _swap(_amountAOut, _amountBOut, _to);
        
        emit Swap(msg.sender, amountAIn, amountBIn, _amountAOut, _amountBOut, _to);
        _sync();
    }

    /**
     * @notice Get the encrypted swap accumulator (demonstrates FHE return value)
     * @return Encrypted swap accumulator value
     */
    function getEncryptedSwapAccumulator() external view returns (euint32) {
        return _encryptedSwapAccumulator;
    }

    function addLiquidity(address _to) external nonReentrant {
        _addLiquidity(_to);
    }

    function removeLiquidity(address _to) external nonReentrant {
        uint256 liquidity = balanceOf(msg.sender);
        require(liquidity > 0, "FHESplitFeeCFMM: Insufficient liquidity");
        _removeExactLiquidity(liquidity, _to);
    }

    function removeExactLiquidity(uint256 _amount, address _to) external nonReentrant {
        require(_amount > 0, "FHESplitFeeCFMM: Insufficient liquidity");
        require(balanceOf(msg.sender) >= _amount, "FHESplitFeeCFMM: Insufficient balance");
        _removeExactLiquidity(_amount, _to);
    }

    function claimFees() external {
        _claimFees();
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }

    function getAmountOut(address _tokenIn, uint256 _amountIn) external view returns (uint256) {
        require(_amountIn > 0, "FHESplitFeeCFMM: Insufficient input amount");
        require(_tokenIn == tokenA || _tokenIn == tokenB, "FHESplitFeeCFMM: Invalid token");
        
        uint256 reserveIn;
        uint256 reserveOut;
        
        if (_tokenIn == tokenA) {
            reserveIn = reserveA;
            reserveOut = reserveB;
        } else {
            reserveIn = reserveB;
            reserveOut = reserveA;
        }
        
        // Apply fee: amountIn * (10000 - TOTAL_FEE_BPS) / 10000
        uint256 amountInWithFee = _amountIn * (10000 - TOTAL_FEE_BPS) / 10000;
        
        // Constant product formula
        uint256 numerator = reserveOut * amountInWithFee;
        uint256 denominator = reserveIn + amountInWithFee;
        uint256 amountOut = numerator / denominator;
        
        return amountOut;
    }

    function getProtocolFeeRecipient() external view returns (address) {
        return protocolFeeRecipient;
    }

    function getTokenA() external view returns (address) {
        return tokenA;
    }

    function getTokenB() external view returns (address) {
        return tokenB;
    }

    function getTotalLiquidity() external view returns (uint256) {
        return reserveA * reserveB;
    }

    function getReserveA() external view returns (uint256) {
        return reserveA;
    }

    function getReserveB() external view returns (uint256) {
        return reserveB;
    }

    // Internal functions
    /**
     * @notice Safely calculate (liquidity * feePerShare) / ACC_PRECISION with overflow protection
     * @param liquidity User's liquidity amount
     * @param feePerShare Accumulated fee per share
     * @return The calculated fee amount
     */
    function _safeCalculateFee(uint256 liquidity, uint256 feePerShare) internal pure returns (uint256) {
        if (feePerShare == 0 || liquidity == 0) {
            return 0;
        }
        
        // Check if multiplication would overflow
        if (liquidity > type(uint256).max / feePerShare) {
            // Split calculation to avoid overflow: (a * b) / c = (a / c) * b + ((a % c) * b) / c
            uint256 quotient = liquidity / ACC_PRECISION;
            uint256 remainder = liquidity % ACC_PRECISION;
            uint256 result = quotient * feePerShare;
            result += (remainder * feePerShare) / ACC_PRECISION;
            return result;
        } else {
            return (liquidity * feePerShare) / ACC_PRECISION;
        }
    }

    function _swap(
        uint256 _amountAOut, 
        uint256 _amountBOut, 
        address _to
    ) internal returns (uint256 amountAIn, uint256 amountBIn) {
        uint256 _reserveA = reserveA;
        uint256 _reserveB = reserveB;
        
        if (_amountAOut > 0) {
            // Swapping tokenA for tokenB
            require(_amountAOut < _reserveA, "FHESplitFeeCFMM: Insufficient reserveA");
            
            // Calculate required input using constant product formula
            uint256 numerator = _reserveA * _reserveB;
            uint256 denominator = _reserveA - _amountAOut;
            uint256 amountBInWithFee = (numerator / denominator) - _reserveB;
            
            // amountBIn (without fee): amountBIn = amountBInWithFee * (10000 - TOTAL_FEE_BPS)) / 10000
            amountBIn = (amountBInWithFee * (10000 - TOTAL_FEE_BPS)) / 10000;
            
            require(amountBIn > 0, "FHESplitFeeCFMM: Insufficient input amount");
            
            // Transfer tokens
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountBIn);
            IERC20(tokenA).transfer(_to, _amountAOut);
            
            // Calculate fees
            uint256 protocolFee = (amountBIn * PROTOCOL_FEE_BPS) / 10000;
            uint256 userFee = amountBInWithFee - protocolFee - amountBIn;
            
            // Transfer protocol fee
            if (protocolFee > 0) {
                IERC20(tokenB).transfer(protocolFeeRecipient, protocolFee);
            }
            
            // Update reserves
            reserveA = _reserveA - _amountAOut;
            reserveB = _reserveB + amountBIn;
            
            // Accumulate user fees
            uint256 totalSupply = totalSupply();
            if (totalSupply > 0 && userFee > 0) {
                accumulatedTokenBFeePerShare += (userFee * ACC_PRECISION) / totalSupply;
            }
        } else {
            // Swapping tokenB for tokenA
            require(_amountBOut < _reserveB, "FHESplitFeeCFMM: Insufficient reserveB");
            
            // Calculate required input using constant product formula
            uint256 numerator = _reserveA * _reserveB;
            uint256 denominator = _reserveB - _amountBOut;
            uint256 amountAInWithFee = (numerator / denominator) - _reserveA;

            // Apply fee: amountAIn = amountAInWithFee (10000 - TOTAL_FEE_BPS)) / 10000;
            amountAIn = (amountAInWithFee * (10000 - TOTAL_FEE_BPS)) / 10000;
            
            require(amountAIn > 0, "FHESplitFeeCFMM: Insufficient input amount");
            
            // Transfer tokens
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn);
            IERC20(tokenB).transfer(_to, _amountBOut);
            
            // Calculate fees
            uint256 protocolFee = (amountAIn * PROTOCOL_FEE_BPS) / 10000;
            uint256 userFee = amountAInWithFee - protocolFee - amountAIn;
            
            // Transfer protocol fee
            if (protocolFee > 0) {
                IERC20(tokenA).transfer(protocolFeeRecipient, protocolFee);
            }
            
            // Update reserves
            reserveA = _reserveA + amountAIn;
            reserveB = _reserveB - _amountBOut;
            
            // Accumulate user fees
            uint256 totalSupply = totalSupply();
            if (totalSupply > 0 && userFee > 0) {
                accumulatedTokenAFeePerShare += (userFee * ACC_PRECISION) / totalSupply;
            }
        }
    }

    function _addLiquidity(address _to) internal {
        uint256 _reserveA = reserveA;
        uint256 _reserveB = reserveB;
        
        // Get current balances (user must transfer tokens first)
        uint256 balanceA = IERC20(tokenA).balanceOf(address(this));
        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));
        
        uint256 amountA = balanceA - _reserveA;
        uint256 amountB = balanceB - _reserveB;
        
        require(amountA > 0 && amountB > 0, "FHESplitFeeCFMM: Insufficient amounts");
        
        uint256 totalSupply = totalSupply();
        uint256 liquidity;
        
        if (totalSupply == 0) {
            // First liquidity provision
            liquidity = amountA * amountB;
            require(liquidity >= MINIMUM_LIQUIDITY, "FHESplitFeeCFMM: Insufficient liquidity minted");
            liquidity -= MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // Lock minimum liquidity
        } else {
            // Calculate liquidity based on proportional deposit
            uint256 liquidityA = (amountA * totalSupply) / _reserveA;
            uint256 liquidityB = (amountB * totalSupply) / _reserveB;
            liquidity = liquidityA < liquidityB ? liquidityA : liquidityB;
        }
        
        require(liquidity > 0, "FHESplitFeeCFMM: Insufficient liquidity minted");
        
        // Update user info for fee tracking
        UserInfo storage user = userInfo[_to];
        uint256 userLiquidity = balanceOf(_to);
        
        if (userLiquidity > 0) {
            // Claim pending fees before updating
            uint256 pendingA = _safeCalculateFee(userLiquidity, accumulatedTokenAFeePerShare);
            uint256 pendingB = _safeCalculateFee(userLiquidity, accumulatedTokenBFeePerShare);
            
            // Subtract reward debt, handling underflow
            if (pendingA >= user.rewardDebtA) {
                pendingA = pendingA - user.rewardDebtA;
            } else {
                pendingA = 0;
            }
            
            if (pendingB >= user.rewardDebtB) {
                pendingB = pendingB - user.rewardDebtB;
            } else {
                pendingB = 0;
            }
            
            if (pendingA > 0 || pendingB > 0) {
                if (pendingA > 0) {
                    IERC20(tokenA).transfer(_to, pendingA);
                }
                if (pendingB > 0) {
                    IERC20(tokenB).transfer(_to, pendingB);
                }
                emit FeesClaimed(_to, pendingA, pendingB);
            }
        }
        
        // Mint LP tokens
        _mint(_to, liquidity);
        
        // Update user reward debt
        uint256 newBalance = balanceOf(_to);
        user.rewardDebtA = _safeCalculateFee(newBalance, accumulatedTokenAFeePerShare);
        user.rewardDebtB = _safeCalculateFee(newBalance, accumulatedTokenBFeePerShare);
        
        // Update reserves
        reserveA = balanceA;
        reserveB = balanceB;
        
        emit Mint(msg.sender, amountA, amountB);
    }

    function _removeExactLiquidity(uint256 _amount, address _to) internal {
        require(_amount > 0, "FHESplitFeeCFMM: Insufficient liquidity");
        
        uint256 _reserveA = reserveA;
        uint256 _reserveB = reserveB;
        uint256 totalSupply = totalSupply();
        
        // Calculate amounts to return proportionally
        uint256 amountA = (_amount * _reserveA) / totalSupply;
        uint256 amountB = (_amount * _reserveB) / totalSupply;
        
        require(amountA > 0 && amountB > 0, "FHESplitFeeCFMM: Insufficient liquidity burned");
        
        // Update user info for fee tracking
        UserInfo storage user = userInfo[msg.sender];
        uint256 userLiquidity = balanceOf(msg.sender);
        
        // Claim pending fees before removing liquidity
        uint256 pendingA = _safeCalculateFee(userLiquidity, accumulatedTokenAFeePerShare);
        uint256 pendingB = _safeCalculateFee(userLiquidity, accumulatedTokenBFeePerShare);
        
        // Subtract reward debt, handling underflow
        if (pendingA >= user.rewardDebtA) {
            pendingA = pendingA - user.rewardDebtA;
        } else {
            pendingA = 0;
        }
        
        if (pendingB >= user.rewardDebtB) {
            pendingB = pendingB - user.rewardDebtB;
        } else {
            pendingB = 0;
        }
        
        if (pendingA > 0 || pendingB > 0) {
            if (pendingA > 0) {
                IERC20(tokenA).transfer(msg.sender, pendingA);
            }
            if (pendingB > 0) {
                IERC20(tokenB).transfer(msg.sender, pendingB);
            }
            emit FeesClaimed(msg.sender, pendingA, pendingB);
        }
        
        // Burn LP tokens
        _burn(msg.sender, _amount);
        
        // Update user reward debt
        uint256 newBalance = balanceOf(msg.sender);
        user.rewardDebtA = _safeCalculateFee(newBalance, accumulatedTokenAFeePerShare);
        user.rewardDebtB = _safeCalculateFee(newBalance, accumulatedTokenBFeePerShare);
        
        // Transfer tokens to user
        IERC20(tokenA).transfer(_to, amountA);
        IERC20(tokenB).transfer(_to, amountB);
        
        // Update reserves
        reserveA = _reserveA - amountA;
        reserveB = _reserveB - amountB;
        
        emit Burn(msg.sender, amountA, amountB, _to);
    }

    function _claimFees() internal {
        UserInfo storage user = userInfo[msg.sender];
        uint256 userLiquidity = balanceOf(msg.sender);
        
        require(userLiquidity > 0, "FHESplitFeeCFMM: No liquidity to claim fees from");
        
        // Calculate pending fees with overflow protection
        uint256 pendingA = _safeCalculateFee(userLiquidity, accumulatedTokenAFeePerShare);
        uint256 pendingB = _safeCalculateFee(userLiquidity, accumulatedTokenBFeePerShare);
        
        // Subtract reward debt, handling underflow
        if (pendingA >= user.rewardDebtA) {
            pendingA = pendingA - user.rewardDebtA;
        } else {
            pendingA = 0;
        }
        
        if (pendingB >= user.rewardDebtB) {
            pendingB = pendingB - user.rewardDebtB;
        } else {
            pendingB = 0;
        }
        
        require(pendingA > 0 || pendingB > 0, "FHESplitFeeCFMM: No fees to claim");
        
        // Update reward debt
        user.rewardDebtA = _safeCalculateFee(userLiquidity, accumulatedTokenAFeePerShare);
        user.rewardDebtB = _safeCalculateFee(userLiquidity, accumulatedTokenBFeePerShare);
        
        // Transfer fees
        if (pendingA > 0) {
            IERC20(tokenA).transfer(msg.sender, pendingA);
        }
        if (pendingB > 0) {
            IERC20(tokenB).transfer(msg.sender, pendingB);
        }
        
        emit FeesClaimed(msg.sender, pendingA, pendingB);
    }

    function _sync() internal {
        emit Sync(reserveA, reserveB);
    }
}
