// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SplitFeeFactory.sol";
import "./SplitFeeCFMM.sol";

/**
 * @title MarketRouter
 * @author Marc-Aurèle Besner (marc-aurele-besner)
 * @notice MarketRouter provides a user-friendly interface for swapping tokens and managing liquidity
 * @dev This router handles token transfers and routes swaps to the appropriate SplitFeeCFMM pairs
 */

contract MarketRouter is ReentrancyGuard {
    SplitFeeFactory public immutable factory;

    // Events
    event Swap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed to
    );

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "MarketRouter: Expired");
        _;
    }

    constructor(address _factory) {
        factory = SplitFeeFactory(_factory);
    }

    /**
     * @notice Swaps an exact amount of input tokens for a minimum amount of output tokens
     * @param amountIn Exact amount of input tokens
     * @param amountOutMin Minimum amount of output tokens to receive
     * @param path Array of token addresses representing the swap path
     * @param to Address to receive output tokens
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amounts Array of input/output amounts for each step in the path
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length >= 2, "MarketRouter: Invalid path");
        require(to != address(0), "MarketRouter: Invalid to");

        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "MarketRouter: Insufficient output amount");

        // Transfer input tokens from user to router
        IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);

        // Execute swaps through the path
        _swap(amounts, path, to);
    }

    /**
     * @notice Swaps a maximum amount of input tokens for an exact amount of output tokens
     * @param amountOut Exact amount of output tokens to receive
     * @param amountInMax Maximum amount of input tokens to spend
     * @param path Array of token addresses representing the swap path
     * @param to Address to receive output tokens
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amounts Array of input/output amounts for each step in the path
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length >= 2, "MarketRouter: Invalid path");
        require(to != address(0), "MarketRouter: Invalid to");

        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "MarketRouter: Excessive input amount");

        // Transfer input tokens from user to router
        IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);

        // Execute swaps through the path
        _swap(amounts, path, to);
    }

    /**
     * @notice Adds liquidity to a pair
     * @param tokenA Address of token A
     * @param tokenB Address of token B
     * @param amountADesired Desired amount of token A
     * @param amountBDesired Desired amount of token B
     * @param amountAMin Minimum amount of token A (slippage protection)
     * @param amountBMin Minimum amount of token B (slippage protection)
     * @param to Address to receive LP tokens
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amountA Actual amount of token A added
     * @return amountB Actual amount of token B added
     * @return liquidity Amount of LP tokens minted
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(tokenA != tokenB, "MarketRouter: Identical addresses");
        require(to != address(0), "MarketRouter: Invalid to");

        address pair = _getPair(tokenA, tokenB);
        require(pair != address(0), "MarketRouter: Pair does not exist");

        SplitFeeCFMM pairContract = SplitFeeCFMM(pair);
        (uint256 reserveA, uint256 reserveB) = pairContract.getReserves();

        if (reserveA == 0 && reserveB == 0) {
            // First liquidity provision
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            // Calculate optimal amounts
            uint256 amountBOptimal = _quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountADesired >= amountAMin, "MarketRouter: Insufficient A amount");
                require(amountBOptimal >= amountBMin, "MarketRouter: Insufficient B amount");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = _quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal <= amountADesired, "MarketRouter: Insufficient A amount");
                require(amountAOptimal >= amountAMin, "MarketRouter: Insufficient A amount");
                require(amountBDesired >= amountBMin, "MarketRouter: Insufficient B amount");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }

        // Transfer tokens to pair
        IERC20(tokenA).transferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountB);

        // Add liquidity
        pairContract.addLiquidity(to);

        liquidity = pairContract.balanceOf(to);
    }

    /**
     * @notice Removes liquidity from a pair
     * @param tokenA Address of token A
     * @param tokenB Address of token B
     * @param liquidity Amount of LP tokens to burn
     * @param amountAMin Minimum amount of token A to receive (slippage protection)
     * @param amountBMin Minimum amount of token B to receive (slippage protection)
     * @param to Address to receive tokens
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amountA Amount of token A received
     * @return amountB Amount of token B received
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        require(tokenA != tokenB, "MarketRouter: Identical addresses");
        require(to != address(0), "MarketRouter: Invalid to");

        address pair = _getPair(tokenA, tokenB);
        require(pair != address(0), "MarketRouter: Pair does not exist");

        SplitFeeCFMM pairContract = SplitFeeCFMM(pair);
        
        // Get expected amounts before removal
        (uint256 reserveA, uint256 reserveB) = pairContract.getReserves();
        amountA = (liquidity * reserveA) / pairContract.totalSupply();
        amountB = (liquidity * reserveB) / pairContract.totalSupply();

        require(amountA >= amountAMin, "MarketRouter: Insufficient A amount");
        require(amountB >= amountBMin, "MarketRouter: Insufficient B amount");

        // Transfer LP tokens from user to router
        // The router will call removeExactLiquidity, which checks balanceOf(msg.sender) = router's balance
        IERC20(pair).transferFrom(msg.sender, address(this), liquidity);

        // Remove liquidity - the pair will burn LP tokens from router's balance and transfer underlying tokens to 'to'
        pairContract.removeExactLiquidity(liquidity, to);
    }

    /**
     * @notice Calculates the output amounts for a given input amount along a path
     * @param amountIn Input amount
     * @param path Array of token addresses representing the swap path
     * @return amounts Array of amounts at each step of the path
     */
    function getAmountsOut(uint256 amountIn, address[] calldata path) public view returns (uint256[] memory amounts) {
        require(path.length >= 2, "MarketRouter: Invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        for (uint256 i; i < path.length - 1; i++) {
            address pair = _getPair(path[i], path[i + 1]);
            require(pair != address(0), "MarketRouter: Pair does not exist");
            amounts[i + 1] = SplitFeeCFMM(pair).getAmountOut(path[i], amounts[i]);
        }
    }

    /**
     * @notice Calculates the input amounts required for a given output amount along a path
     * @param amountOut Output amount
     * @param path Array of token addresses representing the swap path
     * @return amounts Array of amounts at each step of the path
     */
    function getAmountsIn(uint256 amountOut, address[] calldata path) public view returns (uint256[] memory amounts) {
        require(path.length >= 2, "MarketRouter: Invalid path");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;

        // Calculate backwards through the path
        for (uint256 i = path.length - 1; i > 0; i--) {
            address pair = _getPair(path[i - 1], path[i]);
            require(pair != address(0), "MarketRouter: Pair does not exist");
            
            SplitFeeCFMM pairContract = SplitFeeCFMM(pair);
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(pairContract, path[i - 1], path[i]);
            
            // Reverse calculation: given output, calculate required input
            // amountInWithFee = (reserveIn * reserveOut) / (reserveOut - amountOut) - reserveIn
            uint256 numerator = reserveIn * reserveOut;
            uint256 denominator = reserveOut - amounts[i];
            uint256 amountInWithFee = (numerator / denominator) - reserveIn;
            
            // Apply fee: amountIn = amountInWithFee * 10000 / (10000 - 25)
            amounts[i - 1] = (amountInWithFee * 10000) / 9975;
        }
    }

    /**
     * @notice Gets the pair address for two tokens
     * @param tokenA Address of token A
     * @param tokenB Address of token B
     * @return pair Address of the pair contract
     */
    function getPair(address tokenA, address tokenB) external view returns (address pair) {
        return _getPair(tokenA, tokenB);
    }

    // Internal functions

    /**
     * @dev Executes swaps through a path
     */
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            address pair = _getPair(path[i], path[i + 1]);
            address input = path[i];
            address output = path[i + 1];
            
            SplitFeeCFMM pairContract = SplitFeeCFMM(pair);
            
            // Determine which token is tokenA
            address tokenA = pairContract.getTokenA();
            
            // Determine output amount for this step
            uint256 amountOut = amounts[i + 1];
            
            // Determine the recipient
            // For intermediate hops, send to router so it can use for next hop
            // For final hop, send to final recipient
            address recipient = i < path.length - 2 ? address(this) : _to;
            
            // Approve pair to pull input tokens from router
            // For first hop, tokens are already in router from user transfer
            // For intermediate hops, tokens were sent to router from previous swap
            IERC20(input).approve(pair, type(uint256).max);
            
            // Determine swap direction and call swap
            // Note: swap function calculates required input and pulls it from msg.sender (router)
            if (output == tokenA) {
                // Want tokenA out, so we're swapping tokenB for tokenA
                pairContract.swap(amountOut, 0, recipient);
            } else {
                // Want tokenB out, so we're swapping tokenA for tokenB
                pairContract.swap(0, amountOut, recipient);
            }
            
            // Reset approval for gas efficiency
            IERC20(input).approve(pair, 0);
        }
    }

    /**
     * @dev Gets the pair address for two tokens
     */
    function _getPair(address tokenA, address tokenB) internal view returns (address) {
        return factory.getPairAddress(tokenA, tokenB);
    }

    /**
     * @dev Gets reserves for a pair, handling token order
     */
    function _getReserves(
        SplitFeeCFMM pair,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        address pairTokenA = pair.getTokenA();
        (uint256 reserve0, uint256 reserve1) = pair.getReserves();
        
        if (tokenA == pairTokenA) {
            (reserveA, reserveB) = (reserve0, reserve1);
        } else {
            (reserveA, reserveB) = (reserve1, reserve0);
        }
    }

    /**
     * @dev Calculates the optimal amount of token B for a given amount of token A
     */
    function _quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        require(amountA > 0, "MarketRouter: Insufficient amount");
        require(reserveA > 0 && reserveB > 0, "MarketRouter: Insufficient liquidity");
        amountB = (amountA * reserveB) / reserveA;
    }
}

