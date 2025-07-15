// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ICToken
 * @dev Interface for Compound cTokens
 */
interface ICToken {
    function mint(uint mintAmount) external returns (uint);
    function redeem(uint redeemTokens) external returns (uint);
    function redeemUnderlying(uint redeemAmount) external returns (uint);
    function borrow(uint borrowAmount) external returns (uint);
    function repayBorrow(uint repayAmount) external returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function balanceOfUnderlying(address owner) external returns (uint);
    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint);
    function borrowRatePerBlock() external view returns (uint);
    function supplyRatePerBlock() external view returns (uint);
    function totalBorrowsCurrent() external returns (uint);
    function borrowBalanceCurrent(address account) external returns (uint);
    function borrowBalanceStored(address account) external view returns (uint);
    function exchangeRateCurrent() external returns (uint);
    function exchangeRateStored() external view returns (uint);
    function getCash() external view returns (uint);
    function accrueInterest() external returns (uint);
    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint);
    function underlying() external view returns (address);
}

/**
 * @title IComptroller
 * @dev Interface for Compound Comptroller
 */
interface IComptroller {
    function enterMarkets(address[] calldata cTokens) external returns (uint[] memory);
    function exitMarket(address cToken) external returns (uint);
    function getAccountLiquidity(address account) external view returns (uint, uint, uint);
    function getAssetsIn(address account) external view returns (address[] memory);
    function markets(address cToken) external view returns (bool isListed, uint collateralFactorMantissa);
    function liquidationIncentiveMantissa() external view returns (uint);
    function closeFactorMantissa() external view returns (uint);
    function compAccrued(address account) external view returns (uint);
    function claimComp(address holder) external;
    function claimComp(address holder, address[] calldata cTokens) external;
    function getCompAddress() external view returns (address);
    function getAllMarkets() external view returns (address[] memory);
}

/**
 * @title ICERC20
 * @dev Interface for Compound ERC20 cTokens
 */
interface ICERC20 is ICToken {
    function mint(uint mintAmount) external returns (uint);
    function repayBorrow(uint repayAmount) external returns (uint);
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);
    function liquidateBorrow(address borrower, uint repayAmount, address cTokenCollateral) external returns (uint);
}

/**
 * @title ICEther
 * @dev Interface for Compound Ether cToken
 */
interface ICEther is ICToken {
    function mint() external payable;
    function repayBorrow() external payable;
    function repayBorrowBehalf(address borrower) external payable;
    function liquidateBorrow(address borrower, address cTokenCollateral) external payable;
}
