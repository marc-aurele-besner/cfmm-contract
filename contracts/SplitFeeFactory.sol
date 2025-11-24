// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./SplitFeeCFMM.sol";

/**
 * @title SplitFeeFactory
 * @author Marc-Aurèle Besner (marc-aurele-besner)
 * @notice SplitFeeFactory creates and manages SplitFeeCFMM contracts for different token pairs.
 * @dev Terms:
 *      - SplitFeeFactory: This contract, acts as the factory for all SplitFeeCFMM contracts.
 *      - SplitFeeCFMM: A contract for managing DeFi liquidity, tracking accumulated fees per user.
 *      Actions:
 *      - createPair Create a new SplitFeeCFMM contract for a given token pair.
 *      - getPairAddress: Retrieve the contract address for a given token pair.
 *
**/

contract SplitFeeFactory {
    address public owner;
    address public protocolFeeRecipient;

    uint256 public pairCount;
    mapping(address => mapping(address => address)) public pairs;
    mapping(address => bool) public isPair;

    // Events
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 index);
    event ProtocolFeeRecipientChanged(address indexed prevFeeRecipient, address indexed newFeeRecipient);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(address _protocolFeeRecipient) {
        owner = msg.sender;
        protocolFeeRecipient = _protocolFeeRecipient;
        emit ProtocolFeeRecipientChanged(address(0), _protocolFeeRecipient);
    }

    function createPair(
        address _tokenA, 
        address _tokenB, 
        uint256 _amountA, 
        uint256 _amountB
    ) external returns (address) {
        string memory tokenAName = IERC20Metadata(_tokenA).name();
        string memory tokenBName = IERC20Metadata(_tokenB).name();
        string memory tokenASymbol = IERC20Metadata(_tokenA).symbol();
        string memory tokenBSymbol = IERC20Metadata(_tokenB).symbol();

        string memory pairName = string(abi.encodePacked("SplitFeeCFMM", tokenAName, tokenBName));
        string memory pairSymbol = string(abi.encodePacked("SFC", tokenASymbol, tokenBSymbol));

        address pair = address(
            new SplitFeeCFMM(_tokenA, _tokenB, protocolFeeRecipient, _amountA, _amountB, pairName, pairSymbol));

        pairs[_tokenA][_tokenB] = pair;
        pairs[_tokenB][_tokenA] = pair;
        isPair[pair] = true;
        pairCount++;

        emit PairCreated(_tokenA, _tokenB, pair, pairCount);

        return pair;
    }

    function setProtocolFeeRecipient(address _protocolFeeRecipient) external onlyOwner {
        emit ProtocolFeeRecipientChanged(protocolFeeRecipient, _protocolFeeRecipient);
        protocolFeeRecipient = _protocolFeeRecipient;
    }
    
    function getPairAddress(address _tokenA, address _tokenB) external view returns (address) {
        return pairs[_tokenA][_tokenB];
    }

    function getIsPair(address _pair) external view returns (bool) {
        return isPair[_pair];
    }
}