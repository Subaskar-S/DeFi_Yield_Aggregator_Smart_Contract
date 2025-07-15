// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IVault.sol";
import "../interfaces/IStrategy.sol";

/**
 * @title YieldVault
 * @dev Main vault contract that manages user deposits and strategy allocations
 */
contract YieldVault is ERC20, Pausable, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;


    // The underlying token this vault accepts
    IERC20 public immutable underlying;
    
    // Array of active strategies
    address[] public strategies;
    
    // Strategy allocation mapping (strategy => allocation in basis points)
    mapping(address => uint256) public strategyAllocations;
    
    // Strategy index mapping for efficient removal
    mapping(address => uint256) public strategyIndex;
    
    // Total allocation across all strategies (should equal 10000 = 100%)
    uint256 public totalAllocation;
    
    // Minimum deposit amount
    uint256 public minDeposit;
    
    // Maximum total assets under management
    uint256 public maxTotalAssets;
    
    // Withdrawal fee (in basis points)
    uint256 public withdrawalFee;
    
    // Fee recipient
    address public feeRecipient;
    
    // Last harvest timestamp
    uint256 public lastHarvest;
    
    // Harvest interval (minimum time between harvests)
    uint256 public harvestInterval;

    // Constants
    uint256 public constant MAX_BPS = 10000;
    uint256 public constant MAX_WITHDRAWAL_FEE = 500; // 5%
    uint256 public constant MIN_HARVEST_INTERVAL = 1 hours;
    uint256 public constant MAX_HARVEST_INTERVAL = 7 days;

    // Events
    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event StrategyAdded(address indexed strategy, uint256 allocation);
    event StrategyRemoved(address indexed strategy);
    event AllocationUpdated(address indexed strategy, uint256 oldAllocation, uint256 newAllocation);
    event Rebalanced();
    event HarvestedAll(uint256 totalRewards);
    event EmergencyWithdraw(address indexed user, uint256 assets);

    modifier validStrategy(address strategy) {
        require(strategy != address(0), "YieldVault: strategy cannot be zero address");
        require(strategyAllocations[strategy] > 0, "YieldVault: strategy not found");
        _;
    }

    constructor(
        address _underlying,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        require(_underlying != address(0), "YieldVault: underlying cannot be zero address");
        require(_owner != address(0), "YieldVault: owner cannot be zero address");
        
        underlying = IERC20(_underlying);
        minDeposit = 1e18; // 1 token minimum
        maxTotalAssets = type(uint256).max; // No limit initially
        withdrawalFee = 0; // No withdrawal fee initially
        feeRecipient = _owner;
        harvestInterval = 24 hours; // Daily harvest by default
    }

    /**
     * @dev Returns the total assets under management
     */
    function totalAssets() public returns (uint256) {
        uint256 total = underlying.balanceOf(address(this));
        
        for (uint256 i = 0; i < strategies.length; i++) {
            total += IStrategy(strategies[i]).totalAssets();
        }
        
        return total;
    }

    /**
     * @dev Converts assets to shares
     */
    function convertToShares(uint256 assets) public returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }

    /**
     * @dev Converts shares to assets
     */
    function convertToAssets(uint256 shares) public returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }

    /**
     * @dev Deposits assets and mints shares to receiver
     */
    function deposit(uint256 assets, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        require(assets >= minDeposit, "YieldVault: deposit below minimum");
        require(assets > 0, "YieldVault: cannot deposit zero");
        require(receiver != address(0), "YieldVault: receiver cannot be zero address");
        require(totalAssets() + assets <= maxTotalAssets, "YieldVault: exceeds max total assets");
        
        shares = convertToShares(assets);
        require(shares > 0, "YieldVault: zero shares");
        
        underlying.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        
        // Deploy funds to strategies
        _deployFunds(assets);
        
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @dev Mints shares and deposits corresponding assets
     */
    function mint(uint256 shares, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        require(shares > 0, "YieldVault: cannot mint zero shares");
        require(receiver != address(0), "YieldVault: receiver cannot be zero address");
        
        assets = convertToAssets(shares);
        require(assets >= minDeposit, "YieldVault: deposit below minimum");
        require(totalAssets() + assets <= maxTotalAssets, "YieldVault: exceeds max total assets");
        
        underlying.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        
        // Deploy funds to strategies
        _deployFunds(assets);
        
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @dev Withdraws assets by burning shares
     */
    function withdraw(uint256 assets, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 shares)
    {
        require(assets > 0, "YieldVault: cannot withdraw zero");
        require(receiver != address(0), "YieldVault: receiver cannot be zero address");
        
        shares = convertToShares(assets);
        require(shares > 0, "YieldVault: zero shares");
        
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "YieldVault: insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        
        _burn(owner, shares);
        
        // Withdraw from strategies if needed
        uint256 availableAssets = underlying.balanceOf(address(this));
        if (availableAssets < assets) {
            _withdrawFromStrategies(assets - availableAssets);
        }
        
        // Apply withdrawal fee
        uint256 fee = (assets * withdrawalFee) / MAX_BPS;
        uint256 netAssets = assets - fee;
        
        if (fee > 0 && feeRecipient != address(0)) {
            underlying.safeTransfer(feeRecipient, fee);
        }
        
        underlying.safeTransfer(receiver, netAssets);
        
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @dev Emergency withdraw all user funds (when paused)
     */
    function emergencyWithdraw(address receiver)
        external
        whenPaused
        nonReentrant
        returns (uint256 assets)
    {
        require(receiver != address(0), "YieldVault: receiver cannot be zero address");

        uint256 shares = balanceOf(msg.sender);
        require(shares > 0, "YieldVault: no shares to withdraw");

        assets = convertToAssets(shares);
        _burn(msg.sender, shares);

        // Withdraw from strategies if needed
        uint256 availableAssets = underlying.balanceOf(address(this));
        if (availableAssets < assets) {
            _withdrawFromStrategies(assets - availableAssets);
        }

        // No withdrawal fee during emergency
        underlying.safeTransfer(receiver, assets);

        emit EmergencyWithdraw(msg.sender, assets);
    }

    /**
     * @dev Adds a new strategy to the vault
     */
    function addStrategy(address strategy, uint256 allocation)
        external
        onlyOwner
    {
        require(strategy != address(0), "YieldVault: strategy cannot be zero address");
        require(allocation > 0, "YieldVault: allocation must be greater than 0");
        require(strategyAllocations[strategy] == 0, "YieldVault: strategy already exists");
        require(totalAllocation + allocation <= MAX_BPS, "YieldVault: total allocation exceeds 100%");

        // Verify strategy compatibility
        require(IStrategy(strategy).underlying() == underlying, "YieldVault: strategy underlying mismatch");
        require(IStrategy(strategy).vault() == address(this), "YieldVault: strategy vault mismatch");

        strategies.push(strategy);
        strategyIndex[strategy] = strategies.length - 1;
        strategyAllocations[strategy] = allocation;
        totalAllocation += allocation;

        emit StrategyAdded(strategy, allocation);
    }

    /**
     * @dev Removes a strategy from the vault
     */
    function removeStrategy(address strategy)
        external
        onlyOwner
        validStrategy(strategy)
    {
        // Withdraw all funds from the strategy
        uint256 withdrawn = IStrategy(strategy).withdrawAll();

        uint256 allocation = strategyAllocations[strategy];
        totalAllocation -= allocation;

        // Remove from strategies array
        uint256 index = strategyIndex[strategy];
        uint256 lastIndex = strategies.length - 1;

        if (index != lastIndex) {
            address lastStrategy = strategies[lastIndex];
            strategies[index] = lastStrategy;
            strategyIndex[lastStrategy] = index;
        }

        strategies.pop();
        delete strategyIndex[strategy];
        delete strategyAllocations[strategy];

        emit StrategyRemoved(strategy);
    }

    /**
     * @dev Updates strategy allocation
     */
    function updateAllocation(address strategy, uint256 allocation)
        external
        onlyOwner
        validStrategy(strategy)
    {
        require(allocation > 0, "YieldVault: allocation must be greater than 0");

        uint256 oldAllocation = strategyAllocations[strategy];
        uint256 newTotalAllocation = totalAllocation - oldAllocation + allocation;
        require(newTotalAllocation <= MAX_BPS, "YieldVault: total allocation exceeds 100%");

        strategyAllocations[strategy] = allocation;
        totalAllocation = newTotalAllocation;

        emit AllocationUpdated(strategy, oldAllocation, allocation);
    }

    /**
     * @dev Rebalances funds across strategies
     */
    function rebalance() external onlyOwner {
        require(strategies.length > 0, "YieldVault: no strategies available");

        uint256 totalAssets_ = totalAssets();
        if (totalAssets_ == 0) return;

        // Withdraw all funds from strategies
        for (uint256 i = 0; i < strategies.length; i++) {
            IStrategy(strategies[i]).withdrawAll();
        }

        // Redeploy according to allocations
        _deployFunds(underlying.balanceOf(address(this)));

        emit Rebalanced();
    }

    /**
     * @dev Harvests rewards from all strategies
     */
    function harvestAll() external {
        require(block.timestamp >= lastHarvest + harvestInterval, "YieldVault: harvest too soon");

        uint256 totalRewards = 0;

        for (uint256 i = 0; i < strategies.length; i++) {
            try IStrategy(strategies[i]).harvest() returns (uint256 rewards) {
                totalRewards += rewards;
            } catch {
                // Continue with other strategies if one fails
            }
        }

        lastHarvest = block.timestamp;
        emit HarvestedAll(totalRewards);
    }

    /**
     * @dev Returns the current weighted average APY
     */
    function currentAPY() external view returns (uint256) {
        if (strategies.length == 0 || totalAllocation == 0) return 0;

        uint256 weightedAPY = 0;

        for (uint256 i = 0; i < strategies.length; i++) {
            address strategy = strategies[i];
            uint256 allocation = strategyAllocations[strategy];
            uint256 strategyAPY = IStrategy(strategy).currentAPY();

            weightedAPY += (strategyAPY * allocation) / MAX_BPS;
        }

        return weightedAPY;
    }

    /**
     * @dev Returns all active strategies
     */
    function getStrategies() external view returns (address[] memory) {
        return strategies;
    }

    /**
     * @dev Returns strategy allocation
     */
    function getAllocation(address strategy) external view returns (uint256) {
        return strategyAllocations[strategy];
    }

    /**
     * @dev Pauses the vault
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpauses the vault
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // Admin functions
    function setMinDeposit(uint256 _minDeposit) external onlyOwner {
        minDeposit = _minDeposit;
    }

    function setMaxTotalAssets(uint256 _maxTotalAssets) external onlyOwner {
        maxTotalAssets = _maxTotalAssets;
    }

    function setWithdrawalFee(uint256 _withdrawalFee) external onlyOwner {
        require(_withdrawalFee <= MAX_WITHDRAWAL_FEE, "YieldVault: withdrawal fee too high");
        withdrawalFee = _withdrawalFee;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "YieldVault: fee recipient cannot be zero address");
        feeRecipient = _feeRecipient;
    }

    function setHarvestInterval(uint256 _harvestInterval) external onlyOwner {
        require(_harvestInterval >= MIN_HARVEST_INTERVAL, "YieldVault: harvest interval too short");
        require(_harvestInterval <= MAX_HARVEST_INTERVAL, "YieldVault: harvest interval too long");
        harvestInterval = _harvestInterval;
    }

    // Internal functions

    /**
     * @dev Deploys funds to strategies according to their allocations
     */
    function _deployFunds(uint256 amount) internal {
        if (amount == 0 || strategies.length == 0 || totalAllocation == 0) return;

        for (uint256 i = 0; i < strategies.length; i++) {
            address strategy = strategies[i];
            uint256 allocation = strategyAllocations[strategy];

            if (allocation > 0) {
                uint256 strategyAmount = (amount * allocation) / totalAllocation;

                if (strategyAmount > 0) {
                    underlying.approve(strategy, strategyAmount);
                    try IStrategy(strategy).deposit(strategyAmount) {
                        // Success
                    } catch {
                        // If deposit fails, keep funds in vault
                        underlying.approve(strategy, 0);
                    }
                }
            }
        }
    }

    /**
     * @dev Withdraws funds from strategies proportionally
     */
    function _withdrawFromStrategies(uint256 amount) internal {
        if (amount == 0 || strategies.length == 0) return;

        uint256 totalWithdrawn = 0;
        uint256 totalStrategyAssets = 0;

        // Calculate total assets in strategies
        for (uint256 i = 0; i < strategies.length; i++) {
            totalStrategyAssets += IStrategy(strategies[i]).totalAssets();
        }

        if (totalStrategyAssets == 0) return;

        // Withdraw proportionally from each strategy
        for (uint256 i = 0; i < strategies.length && totalWithdrawn < amount; i++) {
            address strategy = strategies[i];
            uint256 strategyAssets = IStrategy(strategy).totalAssets();

            if (strategyAssets > 0) {
                uint256 proportionalAmount = (amount * strategyAssets) / totalStrategyAssets;
                uint256 remainingAmount = amount - totalWithdrawn;
                uint256 strategyWithdrawAmount = proportionalAmount < remainingAmount ? proportionalAmount : remainingAmount;

                if (strategyWithdrawAmount > 0) {
                    try IStrategy(strategy).withdraw(strategyWithdrawAmount) returns (uint256 withdrawn) {
                        totalWithdrawn += withdrawn;
                    } catch {
                        // Continue with next strategy if withdrawal fails
                    }
                }
            }
        }

        // If we still need more funds, try withdrawing from strategies with available balance
        if (totalWithdrawn < amount) {
            for (uint256 i = 0; i < strategies.length && totalWithdrawn < amount; i++) {
                address strategy = strategies[i];
                uint256 remainingNeeded = amount - totalWithdrawn;

                try IStrategy(strategy).withdraw(remainingNeeded) returns (uint256 withdrawn) {
                    totalWithdrawn += withdrawn;
                } catch {
                    // Continue with next strategy
                }
            }
        }
    }

    /**
     * @dev Redeems shares for assets
     */
    function redeem(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 assets)
    {
        require(shares > 0, "YieldVault: cannot redeem zero shares");
        require(receiver != address(0), "YieldVault: receiver cannot be zero address");
        require(shares <= balanceOf(owner), "YieldVault: insufficient shares");
        
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "YieldVault: insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        
        assets = convertToAssets(shares);
        _burn(owner, shares);
        
        // Withdraw from strategies if needed
        uint256 availableAssets = underlying.balanceOf(address(this));
        if (availableAssets < assets) {
            _withdrawFromStrategies(assets - availableAssets);
        }
        
        // Apply withdrawal fee
        uint256 fee = (assets * withdrawalFee) / MAX_BPS;
        uint256 netAssets = assets - fee;
        
        if (fee > 0 && feeRecipient != address(0)) {
            underlying.safeTransfer(feeRecipient, fee);
        }
        
        underlying.safeTransfer(receiver, netAssets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}
