// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../BaseStrategy.sol";
import "../../interfaces/external/ICompound.sol";

/**
 * @title CompoundStrategy
 * @dev Strategy for lending tokens on Compound Finance
 */
contract CompoundStrategy is BaseStrategy {
    using SafeERC20 for IERC20;

    // Compound cToken contract
    ICERC20 public immutable cToken;
    
    // Compound Comptroller contract
    IComptroller public immutable comptroller;
    
    // COMP token for rewards
    IERC20 public immutable compToken;
    
    // Exchange rate precision
    uint256 private constant EXCHANGE_RATE_SCALE = 1e18;
    
    // Blocks per year (approximate)
    uint256 private constant BLOCKS_PER_YEAR = 2102400;

    constructor(
        address _underlying,
        address _vault,
        address _cToken,
        address _comptroller,
        address _compToken,
        address _owner
    ) BaseStrategy(_underlying, _vault, "Compound Strategy", _owner) {
        require(_cToken != address(0), "CompoundStrategy: cToken cannot be zero address");
        require(_comptroller != address(0), "CompoundStrategy: comptroller cannot be zero address");
        require(_compToken != address(0), "CompoundStrategy: compToken cannot be zero address");
        
        cToken = ICERC20(_cToken);
        comptroller = IComptroller(_comptroller);
        compToken = IERC20(_compToken);
        
        // Verify cToken underlying matches our underlying
        require(cToken.underlying() == _underlying, "CompoundStrategy: underlying mismatch");
        
        // Enter the market
        address[] memory markets = new address[](1);
        markets[0] = _cToken;
        comptroller.enterMarkets(markets);
        
        // Approve cToken to spend underlying tokens
        underlying.approve(_cToken, type(uint256).max);
    }

    /**
     * @dev Returns the total assets under management by this strategy
     */
    function totalAssets() external override returns (uint256) {
        return cToken.balanceOfUnderlying(address(this));
    }

    /**
     * @dev Returns the current APY of this strategy (in basis points)
     */
    function currentAPY() external view override returns (uint256) {
        uint256 supplyRatePerBlock = cToken.supplyRatePerBlock();
        // Convert to annual rate: (1 + rate)^blocks_per_year - 1
        // Simplified calculation for demonstration
        uint256 annualRate = supplyRatePerBlock * BLOCKS_PER_YEAR;
        return (annualRate * MAX_BPS) / EXCHANGE_RATE_SCALE;
    }

    /**
     * @dev Returns the balance of underlying tokens held by this strategy
     */
    function balanceOf() external override returns (uint256) {
        return cToken.balanceOfUnderlying(address(this));
    }

    /**
     * @dev Internal deposit function
     */
    function _deposit(uint256 amount) internal override returns (uint256) {
        if (amount == 0) return 0;
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        require(balanceBefore >= amount, "CompoundStrategy: insufficient balance");
        
        // Mint cTokens
        uint256 result = cToken.mint(amount);
        require(result == 0, "CompoundStrategy: mint failed");
        
        return amount;
    }

    /**
     * @dev Internal withdraw function
     */
    function _withdraw(uint256 amount) internal override returns (uint256) {
        if (amount == 0) return 0;
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        
        // Redeem underlying tokens
        uint256 result = cToken.redeemUnderlying(amount);
        require(result == 0, "CompoundStrategy: redeem failed");
        
        uint256 balanceAfter = underlying.balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    /**
     * @dev Internal withdraw all function
     */
    function _withdrawAll() internal override returns (uint256) {
        uint256 cTokenBalance = cToken.balanceOf(address(this));
        if (cTokenBalance == 0) return 0;
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        
        // Redeem all cTokens
        uint256 result = cToken.redeem(cTokenBalance);
        require(result == 0, "CompoundStrategy: redeem all failed");
        
        uint256 balanceAfter = underlying.balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    /**
     * @dev Internal harvest function
     */
    function _harvest() internal override returns (uint256) {
        // Claim COMP rewards
        comptroller.claimComp(address(this));
        
        uint256 compBalance = compToken.balanceOf(address(this));
        if (compBalance < minHarvestAmount) return 0;
        
        // For simplicity, we'll just return the COMP balance
        // In a real implementation, you would swap COMP for underlying tokens
        // using a DEX like Uniswap
        
        return compBalance;
    }

    /**
     * @dev Emergency function to exit Compound market
     */
    function exitMarket() external onlyOwner {
        uint256 result = comptroller.exitMarket(address(cToken));
        require(result == 0, "CompoundStrategy: exit market failed");
    }

    /**
     * @dev Emergency function to recover tokens
     */
    function recoverToken(address token, uint256 amount) external onlyOwner {
        require(token != address(underlying), "CompoundStrategy: cannot recover underlying");
        require(token != address(cToken), "CompoundStrategy: cannot recover cToken");
        
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @dev Get current exchange rate from cToken to underlying
     */
    function getExchangeRate() external view returns (uint256) {
        return cToken.exchangeRateStored();
    }

    /**
     * @dev Get current supply rate per block
     */
    function getSupplyRatePerBlock() external view returns (uint256) {
        return cToken.supplyRatePerBlock();
    }

    /**
     * @dev Get cToken balance
     */
    function getCTokenBalance() external view returns (uint256) {
        return cToken.balanceOf(address(this));
    }

    /**
     * @dev Get COMP balance
     */
    function getCompBalance() external view returns (uint256) {
        return compToken.balanceOf(address(this));
    }

    /**
     * @dev Get accrued COMP rewards
     */
    function getAccruedComp() external view returns (uint256) {
        return comptroller.compAccrued(address(this));
    }
}
