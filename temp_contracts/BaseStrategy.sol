// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IStrategy.sol";

/**
 * @title BaseStrategy
 * @dev Abstract base contract for all yield farming strategies
 */
abstract contract BaseStrategy is IStrategy, Pausable, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // The underlying token this strategy accepts
    IERC20 public immutable override underlying;
    
    // The vault that owns this strategy
    address public immutable override vault;
    
    // Strategy name for identification
    string public name;
    
    // Whether the strategy is active
    bool public override isActive;
    
    // Performance fee (in basis points, e.g., 1000 = 10%)
    uint256 public performanceFee;
    
    // Fee recipient
    address public feeRecipient;
    
    // Maximum slippage tolerance (in basis points)
    uint256 public maxSlippage;
    
    // Minimum harvest amount to trigger harvest
    uint256 public minHarvestAmount;

    // Constants
    uint256 public constant MAX_BPS = 10000;
    uint256 public constant MAX_PERFORMANCE_FEE = 2000; // 20%
    uint256 public constant MAX_SLIPPAGE = 1000; // 10%

    modifier onlyVault() {
        require(msg.sender == vault, "BaseStrategy: caller is not the vault");
        _;
    }

    modifier onlyVaultOrOwner() {
        require(msg.sender == vault || msg.sender == owner(), "BaseStrategy: caller is not vault or owner");
        _;
    }

    constructor(
        address _underlying,
        address _vault,
        string memory _name,
        address _owner
    ) Ownable(_owner) {
        require(_underlying != address(0), "BaseStrategy: underlying cannot be zero address");
        require(_vault != address(0), "BaseStrategy: vault cannot be zero address");
        require(_owner != address(0), "BaseStrategy: owner cannot be zero address");
        
        underlying = IERC20(_underlying);
        vault = _vault;
        name = _name;
        isActive = true;
        performanceFee = 1000; // 10% default
        feeRecipient = _owner;
        maxSlippage = 300; // 3% default
        minHarvestAmount = 1e18; // 1 token default
    }

    /**
     * @dev Deposits assets into the strategy
     */
    function deposit(uint256 amount) external override onlyVault whenNotPaused nonReentrant returns (uint256) {
        require(amount > 0, "BaseStrategy: amount must be greater than 0");
        require(isActive, "BaseStrategy: strategy is not active");
        
        uint256 balanceBefore = underlying.balanceOf(address(this));
        underlying.safeTransferFrom(vault, address(this), amount);
        uint256 actualAmount = underlying.balanceOf(address(this)) - balanceBefore;
        
        uint256 deposited = _deposit(actualAmount);
        
        emit Deposited(deposited);
        return deposited;
    }

    /**
     * @dev Withdraws assets from the strategy
     */
    function withdraw(uint256 amount) external override onlyVault nonReentrant returns (uint256) {
        require(amount > 0, "BaseStrategy: amount must be greater than 0");
        
        uint256 withdrawn = _withdraw(amount);
        
        if (withdrawn > 0) {
            underlying.safeTransfer(vault, withdrawn);
        }
        
        emit Withdrawn(withdrawn);
        return withdrawn;
    }

    /**
     * @dev Withdraws all assets from the strategy (emergency)
     */
    function withdrawAll() external override onlyVaultOrOwner nonReentrant returns (uint256) {
        uint256 totalWithdrawn = _withdrawAll();
        
        if (totalWithdrawn > 0) {
            underlying.safeTransfer(vault, totalWithdrawn);
        }
        
        emit Withdrawn(totalWithdrawn);
        return totalWithdrawn;
    }

    /**
     * @dev Harvests rewards and compounds them back into the strategy
     */
    function harvest() external override nonReentrant returns (uint256) {
        require(!paused(), "BaseStrategy: strategy is paused");
        
        uint256 rewards = _harvest();
        
        if (rewards > 0) {
            // Take performance fee
            uint256 fee = (rewards * performanceFee) / MAX_BPS;
            if (fee > 0 && feeRecipient != address(0)) {
                underlying.safeTransfer(feeRecipient, fee);
                rewards -= fee;
            }
            
            // Compound remaining rewards
            if (rewards > 0) {
                _deposit(rewards);
            }
        }
        
        emit Harvested(rewards);
        return rewards;
    }

    /**
     * @dev Pauses the strategy
     */
    function pause() external override onlyVaultOrOwner {
        _pause();
        emit Paused();
    }

    /**
     * @dev Unpauses the strategy
     */
    function unpause() external override onlyVaultOrOwner {
        _unpause();
        emit Unpaused();
    }

    /**
     * @dev Sets the strategy active status
     */
    function setActive(bool _isActive) external onlyOwner {
        isActive = _isActive;
    }

    /**
     * @dev Sets the performance fee
     */
    function setPerformanceFee(uint256 _performanceFee) external onlyOwner {
        require(_performanceFee <= MAX_PERFORMANCE_FEE, "BaseStrategy: performance fee too high");
        performanceFee = _performanceFee;
    }

    /**
     * @dev Sets the fee recipient
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Sets the maximum slippage tolerance
     */
    function setMaxSlippage(uint256 _maxSlippage) external onlyOwner {
        require(_maxSlippage <= MAX_SLIPPAGE, "BaseStrategy: slippage too high");
        maxSlippage = _maxSlippage;
    }

    /**
     * @dev Sets the minimum harvest amount
     */
    function setMinHarvestAmount(uint256 _minHarvestAmount) external onlyOwner {
        minHarvestAmount = _minHarvestAmount;
    }

    // Abstract functions to be implemented by specific strategies
    function _deposit(uint256 amount) internal virtual returns (uint256);
    function _withdraw(uint256 amount) internal virtual returns (uint256);
    function _withdrawAll() internal virtual returns (uint256);
    function _harvest() internal virtual returns (uint256);
    
    // Virtual functions that can be overridden
    function totalAssets() external virtual override returns (uint256);
    function currentAPY() external view virtual override returns (uint256);
    function balanceOf() external virtual override returns (uint256);
}
