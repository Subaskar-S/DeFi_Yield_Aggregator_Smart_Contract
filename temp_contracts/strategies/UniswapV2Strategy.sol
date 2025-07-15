// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../BaseStrategy.sol";
import "../../interfaces/external/IUniswapV2.sol";

/**
 * @title UniswapV2Strategy
 * @dev Strategy for providing liquidity to Uniswap V2 pairs
 */
contract UniswapV2Strategy is BaseStrategy {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // Uniswap V2 Router
    IUniswapV2Router02 public immutable router;
    
    // Uniswap V2 Factory
    IUniswapV2Factory public immutable factory;
    
    // The paired token (e.g., if underlying is DAI, paired might be WETH)
    IERC20 public immutable pairedToken;
    
    // The LP token pair
    IUniswapV2Pair public immutable pair;
    
    // Whether underlying is token0 in the pair
    bool public immutable isToken0;

    constructor(
        address _underlying,
        address _vault,
        address _router,
        address _pairedToken,
        address _owner
    ) BaseStrategy(_underlying, _vault, "Uniswap V2 LP Strategy", _owner) {
        require(_router != address(0), "UniswapV2Strategy: router cannot be zero address");
        require(_pairedToken != address(0), "UniswapV2Strategy: paired token cannot be zero address");
        require(_pairedToken != _underlying, "UniswapV2Strategy: paired token cannot be same as underlying");
        
        router = IUniswapV2Router02(_router);
        factory = IUniswapV2Factory(router.factory());
        pairedToken = IERC20(_pairedToken);
        
        // Get or create pair
        address pairAddress = factory.getPair(_underlying, _pairedToken);
        require(pairAddress != address(0), "UniswapV2Strategy: pair does not exist");
        
        pair = IUniswapV2Pair(pairAddress);
        isToken0 = pair.token0() == _underlying;
        
        // Approve router to spend tokens
        underlying.approve(_router, type(uint256).max);
        pairedToken.approve(_router, type(uint256).max);
    }

    /**
     * @dev Returns the total assets under management by this strategy
     */
    function totalAssets() external override returns (uint256) {
        uint256 lpBalance = pair.balanceOf(address(this));
        if (lpBalance == 0) return 0;
        
        uint256 totalSupply = pair.totalSupply();
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        uint256 underlyingReserve = isToken0 ? uint256(reserve0) : uint256(reserve1);
        
        // Calculate underlying tokens represented by LP tokens
        return (lpBalance * underlyingReserve) / totalSupply;
    }

    /**
     * @dev Returns the current APY of this strategy (in basis points)
     * Note: This is a simplified calculation and doesn't account for impermanent loss
     */
    function currentAPY() external view override returns (uint256) {
        // For LP strategies, APY calculation is complex and depends on:
        // 1. Trading fees earned
        // 2. Impermanent loss
        // 3. Token price movements
        // This is a placeholder returning 0
        // In practice, you'd need historical data and complex calculations
        return 0;
    }

    /**
     * @dev Returns the balance of underlying tokens held by this strategy
     */
    function balanceOf() external override returns (uint256) {
        return this.totalAssets();
    }

    /**
     * @dev Internal deposit function
     */
    function _deposit(uint256 amount) internal override returns (uint256) {
        if (amount == 0) return 0;
        
        uint256 underlyingBalance = underlying.balanceOf(address(this));
        require(underlyingBalance >= amount, "UniswapV2Strategy: insufficient balance");
        
        // Calculate how much paired token we need
        uint256 pairedTokenAmount = _calculatePairedTokenAmount(amount);
        
        // Check if we have enough paired token, if not, swap some underlying
        uint256 pairedTokenBalance = pairedToken.balanceOf(address(this));
        if (pairedTokenBalance < pairedTokenAmount) {
            uint256 swapAmount = (amount * 50) / 100; // Swap 50% to paired token
            _swapUnderlyingToPaired(swapAmount);
            
            // Recalculate amounts after swap
            amount = underlying.balanceOf(address(this));
            pairedTokenAmount = _calculatePairedTokenAmount(amount);
        }
        
        // Add liquidity
        uint256 lpTokensBefore = pair.balanceOf(address(this));
        
        router.addLiquidity(
            address(underlying),
            address(pairedToken),
            amount,
            pairedTokenAmount,
            (amount * (MAX_BPS - maxSlippage)) / MAX_BPS,
            (pairedTokenAmount * (MAX_BPS - maxSlippage)) / MAX_BPS,
            address(this),
            block.timestamp + 300
        );
        
        uint256 lpTokensAfter = pair.balanceOf(address(this));
        
        return lpTokensAfter - lpTokensBefore;
    }

    /**
     * @dev Internal withdraw function
     */
    function _withdraw(uint256 amount) internal override returns (uint256) {
        if (amount == 0) return 0;
        
        uint256 lpBalance = pair.balanceOf(address(this));
        if (lpBalance == 0) return 0;
        
        // Calculate LP tokens to remove based on underlying amount
        uint256 totalUnderlyingInLP = this.totalAssets();
        uint256 lpTokensToRemove = (lpBalance * amount) / totalUnderlyingInLP;
        
        if (lpTokensToRemove > lpBalance) {
            lpTokensToRemove = lpBalance;
        }
        
        uint256 underlyingBefore = underlying.balanceOf(address(this));
        
        // Remove liquidity
        router.removeLiquidity(
            address(underlying),
            address(pairedToken),
            lpTokensToRemove,
            0, // Accept any amount of underlying
            0, // Accept any amount of paired token
            address(this),
            block.timestamp + 300
        );
        
        // Swap paired tokens back to underlying if needed
        uint256 pairedTokenBalance = pairedToken.balanceOf(address(this));
        if (pairedTokenBalance > 0) {
            _swapPairedToUnderlying(pairedTokenBalance);
        }
        
        uint256 underlyingAfter = underlying.balanceOf(address(this));
        return underlyingAfter - underlyingBefore;
    }

    /**
     * @dev Internal withdraw all function
     */
    function _withdrawAll() internal override returns (uint256) {
        uint256 lpBalance = pair.balanceOf(address(this));
        if (lpBalance == 0) return 0;
        
        uint256 underlyingBefore = underlying.balanceOf(address(this));
        
        // Remove all liquidity
        router.removeLiquidity(
            address(underlying),
            address(pairedToken),
            lpBalance,
            0, // Accept any amount of underlying
            0, // Accept any amount of paired token
            address(this),
            block.timestamp + 300
        );
        
        // Swap all paired tokens back to underlying
        uint256 pairedTokenBalance = pairedToken.balanceOf(address(this));
        if (pairedTokenBalance > 0) {
            _swapPairedToUnderlying(pairedTokenBalance);
        }
        
        uint256 underlyingAfter = underlying.balanceOf(address(this));
        return underlyingAfter - underlyingBefore;
    }

    /**
     * @dev Internal harvest function
     */
    function _harvest() internal override returns (uint256) {
        // Uniswap V2 LP tokens automatically compound trading fees
        // No explicit harvest needed, but we return 0 for consistency
        return 0;
    }

    // Helper functions

    /**
     * @dev Calculate how much paired token is needed for a given amount of underlying
     */
    function _calculatePairedTokenAmount(uint256 underlyingAmount) internal view returns (uint256) {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();

        uint256 underlyingReserve = isToken0 ? uint256(reserve0) : uint256(reserve1);
        uint256 pairedReserve = isToken0 ? uint256(reserve1) : uint256(reserve0);

        if (underlyingReserve == 0) return 0;

        return (underlyingAmount * pairedReserve) / underlyingReserve;
    }

    /**
     * @dev Swap underlying tokens for paired tokens
     */
    function _swapUnderlyingToPaired(uint256 amount) internal {
        if (amount == 0) return;

        address[] memory path = new address[](2);
        path[0] = address(underlying);
        path[1] = address(pairedToken);

        router.swapExactTokensForTokens(
            amount,
            0, // Accept any amount of paired token
            path,
            address(this),
            block.timestamp + 300
        );
    }

    /**
     * @dev Swap paired tokens for underlying tokens
     */
    function _swapPairedToUnderlying(uint256 amount) internal {
        if (amount == 0) return;

        address[] memory path = new address[](2);
        path[0] = address(pairedToken);
        path[1] = address(underlying);

        router.swapExactTokensForTokens(
            amount,
            0, // Accept any amount of underlying
            path,
            address(this),
            block.timestamp + 300
        );
    }

    /**
     * @dev Get LP token balance
     */
    function getLPBalance() external view returns (uint256) {
        return pair.balanceOf(address(this));
    }

    /**
     * @dev Get pair reserves
     */
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        return pair.getReserves();
    }

    /**
     * @dev Get paired token balance
     */
    function getPairedTokenBalance() external view returns (uint256) {
        return pairedToken.balanceOf(address(this));
    }

    /**
     * @dev Emergency function to recover tokens
     */
    function recoverToken(address token, uint256 amount) external onlyOwner {
        require(token != address(underlying), "UniswapV2Strategy: cannot recover underlying");
        require(token != address(pairedToken), "UniswapV2Strategy: cannot recover paired token");
        require(token != address(pair), "UniswapV2Strategy: cannot recover LP token");

        IERC20(token).safeTransfer(owner(), amount);
    }
}
