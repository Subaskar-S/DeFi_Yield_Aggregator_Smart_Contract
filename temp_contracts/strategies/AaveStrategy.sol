// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../BaseStrategy.sol";
import "../../interfaces/external/IAave.sol";

/**
 * @title AaveStrategy
 * @dev Strategy for lending tokens on Aave V2
 */
contract AaveStrategy is BaseStrategy {
    using SafeERC20 for IERC20;

    // Aave Lending Pool
    ILendingPool public immutable lendingPool;
    
    // Aave aToken (interest bearing token)
    IAToken public immutable aToken;
    
    // Lending Pool Addresses Provider
    ILendingPoolAddressesProvider public immutable addressesProvider;
    
    // Ray precision (Aave uses 27 decimal precision)
    uint256 private constant RAY = 1e27;
    
    // Seconds per year
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    constructor(
        address _underlying,
        address _vault,
        address _lendingPool,
        address _aToken,
        address _addressesProvider,
        address _owner
    ) BaseStrategy(_underlying, _vault, "Aave Strategy", _owner) {
        require(_lendingPool != address(0), "AaveStrategy: lending pool cannot be zero address");
        require(_aToken != address(0), "AaveStrategy: aToken cannot be zero address");
        require(_addressesProvider != address(0), "AaveStrategy: addresses provider cannot be zero address");
        
        lendingPool = ILendingPool(_lendingPool);
        aToken = IAToken(_aToken);
        addressesProvider = ILendingPoolAddressesProvider(_addressesProvider);
        
        // Verify aToken underlying matches our underlying
        require(aToken.UNDERLYING_ASSET_ADDRESS() == _underlying, "AaveStrategy: underlying mismatch");
        
        // Approve lending pool to spend underlying tokens
        underlying.approve(_lendingPool, type(uint256).max);
    }

    /**
     * @dev Returns the total assets under management by this strategy
     */
    function totalAssets() external override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    /**
     * @dev Returns the current APY of this strategy (in basis points)
     */
    function currentAPY() external view override returns (uint256) {
        (, , , uint128 currentLiquidityRate, , , , , , , , ) = lendingPool.getReserveData(address(underlying));

        // Convert from ray to basis points
        // APY = (1 + rate/seconds_per_year)^seconds_per_year - 1
        // Simplified calculation for demonstration
        uint256 annualRate = (uint256(currentLiquidityRate) * SECONDS_PER_YEAR) / RAY;
        return (annualRate * MAX_BPS) / 1e18;
    }

    /**
     * @dev Returns the balance of underlying tokens held by this strategy
     */
    function balanceOf() external override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    /**
     * @dev Internal deposit function
     */
    function _deposit(uint256 amount) internal override returns (uint256) {
        if (amount == 0) return 0;
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        require(balanceBefore >= amount, "AaveStrategy: insufficient balance");
        
        // Deposit to Aave
        lendingPool.deposit(address(underlying), amount, address(this), 0);
        
        return amount;
    }

    /**
     * @dev Internal withdraw function
     */
    function _withdraw(uint256 amount) internal override returns (uint256) {
        if (amount == 0) return 0;
        
        uint256 aTokenBalance = aToken.balanceOf(address(this));
        uint256 withdrawAmount = amount > aTokenBalance ? aTokenBalance : amount;
        
        if (withdrawAmount == 0) return 0;
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        
        // Withdraw from Aave
        uint256 actualWithdrawn = lendingPool.withdraw(address(underlying), withdrawAmount, address(this));
        
        return actualWithdrawn;
    }

    /**
     * @dev Internal withdraw all function
     */
    function _withdrawAll() internal override returns (uint256) {
        uint256 aTokenBalance = aToken.balanceOf(address(this));
        if (aTokenBalance == 0) return 0;
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        
        // Withdraw all from Aave (use type(uint256).max to withdraw all)
        uint256 actualWithdrawn = lendingPool.withdraw(address(underlying), type(uint256).max, address(this));
        
        return actualWithdrawn;
    }

    /**
     * @dev Internal harvest function
     */
    function _harvest() internal override returns (uint256) {
        // Aave V2 doesn't have native rewards, but some deployments might have incentives
        // This is a placeholder for potential reward harvesting
        // In practice, you might integrate with Aave's incentives controller if available
        
        return 0;
    }

    /**
     * @dev Get current liquidity rate
     */
    function getCurrentLiquidityRate() external view returns (uint256) {
        (, , , uint128 currentLiquidityRate, , , , , , , , ) = lendingPool.getReserveData(address(underlying));
        return uint256(currentLiquidityRate);
    }

    /**
     * @dev Get aToken balance
     */
    function getATokenBalance() external view returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    /**
     * @dev Get user account data
     */
    function getUserAccountData() external view returns (
        uint256 totalCollateralETH,
        uint256 totalDebtETH,
        uint256 availableBorrowsETH,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    ) {
        return lendingPool.getUserAccountData(address(this));
    }

    /**
     * @dev Get reserve data
     */
    function getReserveData() external view returns (
        uint256 configuration,
        uint128 liquidityIndex,
        uint128 variableBorrowIndex,
        uint128 currentLiquidityRate,
        uint128 currentVariableBorrowRate,
        uint128 currentStableBorrowRate,
        uint40 lastUpdateTimestamp,
        address aTokenAddress,
        address stableDebtTokenAddress,
        address variableDebtTokenAddress,
        address interestRateStrategyAddress,
        uint8 id
    ) {
        return lendingPool.getReserveData(address(underlying));
    }

    /**
     * @dev Emergency function to recover tokens
     */
    function recoverToken(address token, uint256 amount) external onlyOwner {
        require(token != address(underlying), "AaveStrategy: cannot recover underlying");
        require(token != address(aToken), "AaveStrategy: cannot recover aToken");
        
        IERC20(token).safeTransfer(owner(), amount);
    }
}
