// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockToken
 * @notice A simple ERC20 token for testing purposes
 */
contract MockConfidentialFungibleToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000 * 10**18);
    }

    /**
     * @notice Mint tokens to a specific address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}




