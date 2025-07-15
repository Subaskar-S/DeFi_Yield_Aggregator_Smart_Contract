// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockCToken is ERC20 {
    IERC20 public immutable underlyingToken;
    uint256 public exchangeRate = 2e17; // 0.2 (1 cToken = 0.2 underlying)
    
    constructor(
        address _underlying,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        underlyingToken = IERC20(_underlying);
    }

    function mint(uint mintAmount) external returns (uint) {
        underlyingToken.transferFrom(msg.sender, address(this), mintAmount);
        uint256 tokensToMint = (mintAmount * 1e18) / exchangeRate;
        _mint(msg.sender, tokensToMint);
        return 0;
    }

    function redeem(uint redeemTokens) external returns (uint) {
        uint256 underlyingAmount = (redeemTokens * exchangeRate) / 1e18;
        _burn(msg.sender, redeemTokens);
        underlyingToken.transfer(msg.sender, underlyingAmount);
        return 0;
    }

    function redeemUnderlying(uint redeemAmount) external returns (uint) {
        uint256 tokensToRedeem = (redeemAmount * 1e18) / exchangeRate;
        _burn(msg.sender, tokensToRedeem);
        underlyingToken.transfer(msg.sender, redeemAmount);
        return 0;
    }

    function balanceOfUnderlying(address owner) external view returns (uint) {
        return (balanceOf(owner) * exchangeRate) / 1e18;
    }

    function exchangeRateCurrent() external view returns (uint) {
        return exchangeRate;
    }

    function exchangeRateStored() external view returns (uint) {
        return exchangeRate;
    }

    function supplyRatePerBlock() external pure returns (uint) {
        return 1e15; // 0.1% per block
    }

    function underlying() external view returns (address) {
        return address(underlyingToken);
    }
}

contract MockComptroller {
    function enterMarkets(address[] calldata) external pure returns (uint[] memory) {
        uint[] memory results = new uint[](1);
        results[0] = 0;
        return results;
    }

    function exitMarket(address) external pure returns (uint) {
        return 0;
    }

    function claimComp(address, address[] calldata) external {}

    function getAccountLiquidity(address) external pure returns (uint, uint, uint) {
        return (0, type(uint256).max, 0);
    }
}
