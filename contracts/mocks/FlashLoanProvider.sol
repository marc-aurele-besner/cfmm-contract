// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FlashLoanProvider
 * @notice Mock flash loan provider for testing complex scenarios
 */
contract FlashLoanProvider {
    mapping(address => uint256) public balances;
    uint256 public constant FLASH_LOAN_FEE_BPS = 9; // 0.09% fee

    function deposit(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[token] = IERC20(token).balanceOf(address(this));
    }

    function flashLoan(
        address token,
        uint256 amount,
        bytes calldata data
    ) external {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        require(balanceBefore >= amount, "FlashLoanProvider: Insufficient liquidity");
        
        IERC20(token).transfer(msg.sender, amount);
        
        // Call the callback
        (bool success, ) = msg.sender.call(data);
        require(success, "FlashLoanProvider: Callback failed");
        
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 fee = (amount * FLASH_LOAN_FEE_BPS) / 10000;
        require(balanceAfter >= balanceBefore + amount + fee, "FlashLoanProvider: Insufficient repayment");
        
        balances[token] = balanceAfter;
    }

    function getBalance(address token) external view returns (uint256) {
        return balances[token];
    }
}

