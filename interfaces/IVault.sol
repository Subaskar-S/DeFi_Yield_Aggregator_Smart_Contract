// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IStrategy.sol";

/**
 * @title IVault
 * @dev Interface for the main vault contract
 */
interface IVault {
    /**
     * @dev Returns the underlying token that this vault accepts
     */
    function underlying() external view returns (IERC20);

    /**
     * @dev Returns the total assets under management
     */
    function totalAssets() external view returns (uint256);

    /**
     * @dev Returns the total supply of vault shares
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the share balance of a user
     */
    function balanceOf(address user) external view returns (uint256);

    /**
     * @dev Converts assets to shares
     */
    function convertToShares(uint256 assets) external view returns (uint256);

    /**
     * @dev Converts shares to assets
     */
    function convertToAssets(uint256 shares) external view returns (uint256);

    /**
     * @dev Deposits assets and mints shares to receiver
     * @param assets The amount of assets to deposit
     * @param receiver The address to receive the shares
     * @return shares The amount of shares minted
     */
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /**
     * @dev Mints shares and deposits corresponding assets
     * @param shares The amount of shares to mint
     * @param receiver The address to receive the shares
     * @return assets The amount of assets deposited
     */
    function mint(uint256 shares, address receiver) external returns (uint256 assets);

    /**
     * @dev Withdraws assets by burning shares
     * @param assets The amount of assets to withdraw
     * @param receiver The address to receive the assets
     * @param owner The address that owns the shares
     * @return shares The amount of shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    /**
     * @dev Redeems shares for assets
     * @param shares The amount of shares to redeem
     * @param receiver The address to receive the assets
     * @param owner The address that owns the shares
     * @return assets The amount of assets withdrawn
     */
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    /**
     * @dev Emergency withdraw all user funds (when paused)
     * @param receiver The address to receive the assets
     * @return assets The amount of assets withdrawn
     */
    function emergencyWithdraw(address receiver) external returns (uint256 assets);

    /**
     * @dev Adds a new strategy to the vault
     * @param strategy The strategy contract address
     * @param allocation The allocation percentage (in basis points)
     */
    function addStrategy(address strategy, uint256 allocation) external;

    /**
     * @dev Removes a strategy from the vault
     * @param strategy The strategy contract address
     */
    function removeStrategy(address strategy) external;

    /**
     * @dev Updates strategy allocation
     * @param strategy The strategy contract address
     * @param allocation The new allocation percentage (in basis points)
     */
    function updateAllocation(address strategy, uint256 allocation) external;

    /**
     * @dev Rebalances funds across strategies
     */
    function rebalance() external;

    /**
     * @dev Harvests rewards from all strategies
     */
    function harvestAll() external;

    /**
     * @dev Returns the current weighted average APY
     */
    function currentAPY() external view returns (uint256);

    /**
     * @dev Returns all active strategies
     */
    function getStrategies() external view returns (address[] memory);

    /**
     * @dev Returns strategy allocation
     */
    function getAllocation(address strategy) external view returns (uint256);

    /**
     * @dev Pauses the vault
     */
    function pause() external;

    /**
     * @dev Unpauses the vault
     */
    function unpause() external;

    /**
     * @dev Returns whether the vault is paused
     */
    function paused() external view returns (bool);

    // Events
    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event StrategyAdded(address indexed strategy, uint256 allocation);
    event StrategyRemoved(address indexed strategy);
    event AllocationUpdated(address indexed strategy, uint256 oldAllocation, uint256 newAllocation);
    event Rebalanced();
    event HarvestedAll(uint256 totalRewards);
    event EmergencyWithdraw(address indexed user, uint256 assets);
}
