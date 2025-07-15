// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleMockCToken is ERC20 {
    IERC20 public immutable underlying;
    uint256 public exchangeRate = 2e17; // 0.2 (1 cToken = 0.2 underlying)
    uint256 private _supplyRatePerBlock = 1e15; // 0.1% per block
    
    constructor(
        address _underlying,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        underlying = IERC20(_underlying);
    }

    function mint(uint mintAmount) external returns (uint) {
        underlying.transferFrom(msg.sender, address(this), mintAmount);
        uint256 tokensToMint = (mintAmount * 1e18) / exchangeRate;
        _mint(msg.sender, tokensToMint);
        return 0;
    }

    function redeem(uint redeemTokens) external returns (uint) {
        uint256 underlyingAmount = (redeemTokens * exchangeRate) / 1e18;
        _burn(msg.sender, redeemTokens);
        underlying.transfer(msg.sender, underlyingAmount);
        return 0;
    }

    function redeemUnderlying(uint redeemAmount) external returns (uint) {
        uint256 tokensToRedeem = (redeemAmount * 1e18) / exchangeRate;
        _burn(msg.sender, tokensToRedeem);
        underlying.transfer(msg.sender, redeemAmount);
        return 0;
    }

    function balanceOfUnderlying(address owner) external returns (uint) {
        return (balanceOf(owner) * exchangeRate) / 1e18;
    }

    function exchangeRateCurrent() external returns (uint) {
        return exchangeRate;
    }

    function exchangeRateStored() external view returns (uint) {
        return exchangeRate;
    }

    function supplyRatePerBlock() external view returns (uint) {
        return _supplyRatePerBlock;
    }

    // Simplified functions
    function borrow(uint) external returns (uint) { return 1; }
    function repayBorrow(uint) external returns (uint) { return 1; }
    function totalBorrowsCurrent() external returns (uint) { return 0; }
    function borrowBalanceCurrent(address) external returns (uint) { return 0; }
    function borrowBalanceStored(address) external view returns (uint) { return 0; }
    function accrueInterest() external returns (uint) { return 0; }
    function seize(address, address, uint) external returns (uint) { return 1; }
}

contract SimpleMockComptroller {
    mapping(address => bool) private _markets;
    
    function enterMarkets(address[] calldata cTokens) external returns (uint[] memory) {
        uint[] memory results = new uint[](cTokens.length);
        for (uint i = 0; i < cTokens.length; i++) {
            _markets[cTokens[i]] = true;
            results[i] = 0;
        }
        return results;
    }

    function exitMarket(address) external returns (uint) {
        return 0;
    }

    function claimComp(address, address[] calldata) external {}

    function getAccountLiquidity(address) external view returns (uint, uint, uint) {
        return (0, type(uint256).max, 0);
    }

    function getAssetsIn(address) external view returns (address[] memory) {
        return new address[](0);
    }

    function markets(address) external view returns (bool, uint) {
        return (true, 8e17);
    }

    function liquidationIncentiveMantissa() external pure returns (uint) { return 108e16; }
    function closeFactorMantissa() external pure returns (uint) { return 5e17; }
    function getAllMarkets() external pure returns (address[] memory) { return new address[](0); }
}
