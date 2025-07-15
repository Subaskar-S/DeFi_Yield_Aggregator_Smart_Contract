// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockCToken
 * @dev Mock Compound cToken for testing
 */
contract MockCToken is ERC20 {

    IERC20 public immutable underlying;
    uint256 public exchangeRate = 1e18; // 1:1 initially
    uint256 public supplyRate = 5e16; // 5% APY per block (simplified)
    
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
        require(balanceOf(msg.sender) >= redeemTokens, "Insufficient balance");
        uint256 underlyingAmount = (redeemTokens * exchangeRate) / 1e18;
        _burn(msg.sender, redeemTokens);
        underlying.transfer(msg.sender, underlyingAmount);
        return 0;
    }

    function redeemUnderlying(uint redeemAmount) external returns (uint) {
        uint256 tokensToRedeem = (redeemAmount * 1e18) / exchangeRate;
        require(balanceOf(msg.sender) >= tokensToRedeem, "Insufficient balance");
        _burn(msg.sender, tokensToRedeem);
        underlying.transfer(msg.sender, redeemAmount);
        return 0;
    }

    function balanceOfUnderlying(address owner) external view returns (uint) {
        return (balanceOf(owner) * exchangeRate) / 1e18;
    }

    function exchangeRateCurrent() external returns (uint) {
        // Simulate interest accrual
        exchangeRate += (exchangeRate * supplyRate) / 1e18 / 2102400; // Per block
        return exchangeRate;
    }

    function exchangeRateStored() external view returns (uint) {
        return exchangeRate;
    }

    function supplyRatePerBlock() external view returns (uint) {
        return supplyRate;
    }

    function borrowRatePerBlock() external view returns (uint) {
        return supplyRate * 2; // Simplified
    }

    // Simplified implementations for other required functions
    function borrow(uint borrowAmount) external returns (uint) { return 1; }
    function repayBorrow(uint repayAmount) external returns (uint) { return 1; }
    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint) {
        return (0, balanceOf(account), 0, exchangeRate);
    }
    function totalBorrowsCurrent() external returns (uint) { return 0; }
    function borrowBalanceCurrent(address account) external returns (uint) { return 0; }
    function borrowBalanceStored(address account) external view returns (uint) { return 0; }
    function getCash() external view returns (uint) { return underlying.balanceOf(address(this)); }
    function accrueInterest() external returns (uint) { return 0; }
    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint) { return 1; }
}

/**
 * @title MockComptroller
 * @dev Mock Compound Comptroller for testing
 */
contract MockComptroller {
    mapping(address => uint256) public compBalances;
    address public compToken;
    
    constructor(address _compToken) {
        compToken = _compToken;
    }

    function enterMarkets(address[] calldata cTokens) external returns (uint[] memory) {
        uint[] memory results = new uint[](cTokens.length);
        return results;
    }

    function exitMarket(address cToken) external returns (uint) {
        return 0;
    }

    function claimComp(address holder) external {
        uint256 compAmount = compBalances[holder];
        if (compAmount > 0) {
            compBalances[holder] = 0;
            IERC20(compToken).transfer(holder, compAmount);
        }
    }

    function claimComp(address holder, address[] calldata cTokens) external {
        this.claimComp(holder);
    }

    function compAccrued(address account) external view returns (uint) {
        return compBalances[account];
    }

    function setCompBalance(address account, uint256 amount) external {
        compBalances[account] = amount;
    }

    // Simplified implementations
    function getAccountLiquidity(address account) external view returns (uint, uint, uint) {
        return (0, 0, 0);
    }
    function getAssetsIn(address account) external view returns (address[] memory) {
        return new address[](0);
    }
    function markets(address cToken) external view returns (bool isListed, uint collateralFactorMantissa) {
        return (true, 0.75e18);
    }
    function liquidationIncentiveMantissa() external view returns (uint) { return 1.08e18; }
    function closeFactorMantissa() external view returns (uint) { return 0.5e18; }
    function getCompAddress() external view returns (address) { return compToken; }
    function getAllMarkets() external view returns (address[] memory) { return new address[](0); }
}
