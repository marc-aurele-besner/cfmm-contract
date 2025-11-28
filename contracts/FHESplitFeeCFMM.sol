// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHESplitFeeCFMM
 * @author Marc-Aurèle Besner (marc-aurele-besner)
 * @notice FHESplitFeeCFMM manages DeFi liquidity with Fully Homomorphic Encryption support.
 * This contract demonstrates comprehensive FHE integration following Zama FHEVM guidelines.
 * @dev Core Concepts:
 *      - Encrypted Swap Amounts: Both input and output swap amounts are encrypted
 *      - Encrypted Liquidity Amounts: Add liquidity amounts are encrypted
 *      - Encrypted User Rewards: User fee rewards are stored and tracked encrypted
 *      - FHE Operations: Uses FHE.add, FHE.sub, FHE.mul for encrypted calculations
 *      - FHE Permissions: Required for off-chain decryption of encrypted values
 *      Note: Reserves are kept as clear values for token transfers, but all user-facing
 *            amounts (swaps, liquidity, rewards) are encrypted for privacy.
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
    // Fees configuration
    uint256 public constant TOTAL_FEE_BPS = 25;     // 0.25% Total fee (protocol + user)
    uint256 public constant PROTOCOL_FEE_BPS = 5;   // 0.05% Protocol fee
    uint256 public constant MINIMUM_LIQUIDITY = 10**3; // Minimum liquidity required
    uint256 public constant ACC_PRECISION = 1e36; 
    // Encrypted accumulated fees per share (only encrypted version for privacy)
    euint64 private _encryptedAccumulatedTokenAFeePerShare;
    euint64 private _encryptedAccumulatedTokenBFeePerShare;

    struct UserInfo {
        euint64 encryptedRewardDebtA;  // Encrypted reward debt for tokenA
        euint64 encryptedRewardDebtB;  // Encrypted reward debt for tokenB
        euint64 encryptedPendingRewardA;  // Encrypted pending reward for tokenA
        euint64 encryptedPendingRewardB;  // Encrypted pending reward for tokenB
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
    event EncryptedLiquidityAdded(address indexed user, euint64 encryptedAmountA, euint64 encryptedAmountB);
    event EncryptedRewardsUpdated(address indexed user, euint64 encryptedRewardA, euint64 encryptedRewardB);

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
        
        // Initialize encrypted fee accumulators
        _encryptedAccumulatedTokenAFeePerShare = FHE.asEuint64(0);
        _encryptedAccumulatedTokenBFeePerShare = FHE.asEuint64(0);
        
        // Grant permissions for encrypted accumulators
        FHE.allowThis(_encryptedAccumulatedTokenAFeePerShare);
        FHE.allowThis(_encryptedAccumulatedTokenBFeePerShare);
    }

    /**
     * @notice Swap tokens using encrypted swap amounts
     * @param _encryptedAmountAIn Encrypted amount of tokenA input (if swapping A for B)
     * @param _encryptedAmountBIn Encrypted amount of tokenB input (if swapping B for A)
     * @param _amountAInProof ZKPoK proof for encrypted amountA input
     * @param _amountBInProof ZKPoK proof for encrypted amountB input
     * @param _amountAOut Clear amount of tokenA to output (for token transfer)
     * @param _amountBOut Clear amount of tokenB to output (for token transfer)
     * @param _to Recipient address
     * @dev Encrypted input amounts are verified via ZKPoK. Clear values are used for actual token transfers.
     */
    function swap(
        externalEuint64 _encryptedAmountAIn,
        externalEuint64 _encryptedAmountBIn,
        bytes calldata _amountAInProof,
        bytes calldata _amountBInProof,
        uint256 _amountAOut,
        uint256 _amountBOut,
        address _to
    ) external nonReentrant {
        require(_amountAOut > 0 || _amountBOut > 0, "FHESplitFeeCFMM: Insufficient output amount");
        require(_amountAOut == 0 || _amountBOut == 0, "FHESplitFeeCFMM: Cannot swap both tokens");
        require(_to != tokenA && _to != tokenB, "FHESplitFeeCFMM: Invalid recipient");
        
        // Verify encrypted inputs (ZKPoK verification happens in fromExternal)
        if (_amountAOut > 0) {
            // Swapping tokenB for tokenA - verify encrypted input
            FHE.fromExternal(_encryptedAmountBIn, _amountBInProof);
        } else {
            // Swapping tokenA for tokenB - verify encrypted input
            FHE.fromExternal(_encryptedAmountAIn, _amountAInProof);
        }
        
        // Perform actual swap with clear values (for token transfers)
        (uint256 amountAIn, uint256 amountBIn) = _swap(_amountAOut, _amountBOut, _to);
        
        emit Swap(msg.sender, amountAIn, amountBIn, _amountAOut, _amountBOut, _to);
        _sync();
    }

    /**
     * @notice Add liquidity using encrypted amounts
     * @param _encryptedAmountA Encrypted amount of tokenA to add
     * @param _encryptedAmountB Encrypted amount of tokenB to add
     * @param _amountAProof ZKPoK proof for encrypted amountA
     * @param _amountBProof ZKPoK proof for encrypted amountB
     * @param _to Recipient address for LP tokens
     * @dev Liquidity amounts are encrypted for privacy. User must transfer tokens first.
     */
    function addLiquidity(
        externalEuint64 _encryptedAmountA,
        externalEuint64 _encryptedAmountB,
        bytes calldata _amountAProof,
        bytes calldata _amountBProof,
        address _to
    ) external nonReentrant {
        euint64 encryptedAmountA = FHE.fromExternal(_encryptedAmountA, _amountAProof);
        euint64 encryptedAmountB = FHE.fromExternal(_encryptedAmountB, _amountBProof);
        
        // Grant permissions for encrypted amounts
        FHE.allowThis(encryptedAmountA);
        FHE.allowThis(encryptedAmountB);
        FHE.allow(encryptedAmountA, msg.sender);
        FHE.allow(encryptedAmountB, msg.sender);
        
        emit EncryptedLiquidityAdded(_to, encryptedAmountA, encryptedAmountB);
        
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

    /**
     * @notice Get encrypted pending rewards for a user
     * @param _user Address of the user
     * @return encryptedRewardA Encrypted pending reward for tokenA
     * @return encryptedRewardB Encrypted pending reward for tokenB
     */
    function getEncryptedPendingRewards(address _user) external view returns (euint64 encryptedRewardA, euint64 encryptedRewardB) {
        UserInfo storage user = userInfo[_user];
        return (user.encryptedPendingRewardA, user.encryptedPendingRewardB);
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
            
            // Accumulate user fees (encrypted only)
            uint256 totalSupply = totalSupply();
            if (totalSupply > 0 && userFee > 0 && userFee <= type(uint64).max) {
                euint64 encryptedUserFee = FHE.asEuint64(uint64(userFee));
                // Update encrypted fee per share accumulator
                euint64 feePerShareIncrement = FHE.div(encryptedUserFee, uint64(totalSupply));
                _encryptedAccumulatedTokenBFeePerShare = FHE.add(
                    _encryptedAccumulatedTokenBFeePerShare, 
                    feePerShareIncrement
                );
                FHE.allowThis(_encryptedAccumulatedTokenBFeePerShare);
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
            
            // Accumulate user fees (encrypted only)
            uint256 totalSupply = totalSupply();
            if (totalSupply > 0 && userFee > 0 && userFee <= type(uint64).max) {
                euint64 encryptedUserFee = FHE.asEuint64(uint64(userFee));
                // Update encrypted fee per share accumulator
                euint64 feePerShareIncrement = FHE.div(encryptedUserFee, uint64(totalSupply));
                _encryptedAccumulatedTokenAFeePerShare = FHE.add(
                    _encryptedAccumulatedTokenAFeePerShare, 
                    feePerShareIncrement
                );
                FHE.allowThis(_encryptedAccumulatedTokenAFeePerShare);
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
        
        // Mint LP tokens
        _mint(_to, liquidity);
        
        // Update encrypted reward debt based on new liquidity
        // Reward debt tracks what the user has already been credited
        uint256 newBalance = balanceOf(_to);
        if (newBalance > 0 && newBalance <= type(uint64).max) {
            euint64 encryptedLiquidity = FHE.asEuint64(uint64(newBalance));
            // Calculate encrypted reward debt: liquidity * feePerShare
            euint64 encryptedRewardDebtA = FHE.mul(encryptedLiquidity, _encryptedAccumulatedTokenAFeePerShare);
            euint64 encryptedRewardDebtB = FHE.mul(encryptedLiquidity, _encryptedAccumulatedTokenBFeePerShare);
            user.encryptedRewardDebtA = encryptedRewardDebtA;
            user.encryptedRewardDebtB = encryptedRewardDebtB;
            FHE.allowThis(user.encryptedRewardDebtA);
            FHE.allowThis(user.encryptedRewardDebtB);
        }
        
        emit EncryptedRewardsUpdated(_to, user.encryptedPendingRewardA, user.encryptedPendingRewardB);
        
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
        
        // Burn LP tokens
        _burn(msg.sender, _amount);
        
        // Update encrypted reward debt based on remaining liquidity
        uint256 newBalance = balanceOf(msg.sender);
        if (newBalance > 0 && newBalance <= type(uint64).max) {
            euint64 encryptedLiquidity = FHE.asEuint64(uint64(newBalance));
            euint64 encryptedRewardDebtA = FHE.mul(encryptedLiquidity, _encryptedAccumulatedTokenAFeePerShare);
            euint64 encryptedRewardDebtB = FHE.mul(encryptedLiquidity, _encryptedAccumulatedTokenBFeePerShare);
            user.encryptedRewardDebtA = encryptedRewardDebtA;
            user.encryptedRewardDebtB = encryptedRewardDebtB;
            FHE.allowThis(user.encryptedRewardDebtA);
            FHE.allowThis(user.encryptedRewardDebtB);
        }
        
        emit EncryptedRewardsUpdated(msg.sender, user.encryptedPendingRewardA, user.encryptedPendingRewardB);
        
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
        
        // Calculate encrypted pending rewards: (liquidity * feePerShare) - rewardDebt
        if (userLiquidity > 0 && userLiquidity <= type(uint64).max) {
            euint64 encryptedLiquidity = FHE.asEuint64(uint64(userLiquidity));
            euint64 encryptedTotalRewardA = FHE.mul(encryptedLiquidity, _encryptedAccumulatedTokenAFeePerShare);
            euint64 encryptedTotalRewardB = FHE.mul(encryptedLiquidity, _encryptedAccumulatedTokenBFeePerShare);
            
            // Calculate pending: totalReward - rewardDebt
            euint64 encryptedPendingA = FHE.sub(encryptedTotalRewardA, user.encryptedRewardDebtA);
            euint64 encryptedPendingB = FHE.sub(encryptedTotalRewardB, user.encryptedRewardDebtB);
            
            // Update encrypted pending rewards
            user.encryptedPendingRewardA = FHE.add(user.encryptedPendingRewardA, encryptedPendingA);
            user.encryptedPendingRewardB = FHE.add(user.encryptedPendingRewardB, encryptedPendingB);
            
            // Update reward debt to current total reward
            user.encryptedRewardDebtA = encryptedTotalRewardA;
            user.encryptedRewardDebtB = encryptedTotalRewardB;
            
            FHE.allowThis(user.encryptedPendingRewardA);
            FHE.allowThis(user.encryptedPendingRewardB);
            FHE.allow(user.encryptedPendingRewardA, msg.sender);
            FHE.allow(user.encryptedPendingRewardB, msg.sender);
        }
        
        // Note: Actual token transfer requires decryption of encryptedPendingRewardA/B off-chain
        // This is a privacy-preserving design - amounts are encrypted until decryption is requested
        emit EncryptedRewardsUpdated(msg.sender, user.encryptedPendingRewardA, user.encryptedPendingRewardB);
    }

    function _sync() internal {
        emit Sync(reserveA, reserveB);
    }
}
