// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IStrategy
 * @dev Interface for yield farming strategies
 */
interface IStrategy {
    /**
     * @dev Returns the underlying token that this strategy accepts
     */
    function underlying() external view returns (IERC20);

    /**
     * @dev Returns the total assets under management by this strategy
     */
    function totalAssets() external returns (uint256);

    /**
     * @dev Returns the current APY of this strategy (in basis points, e.g., 500 = 5%)
     */
    function currentAPY() external view returns (uint256);

    /**
     * @dev Deposits assets into the strategy
     * @param amount The amount of underlying tokens to deposit
     * @return The actual amount deposited
     */
    function deposit(uint256 amount) external returns (uint256);

    /**
     * @dev Withdraws assets from the strategy
     * @param amount The amount of underlying tokens to withdraw
     * @return The actual amount withdrawn
     */
    function withdraw(uint256 amount) external returns (uint256);

    /**
     * @dev Withdraws all assets from the strategy (emergency)
     * @return The total amount withdrawn
     */
    function withdrawAll() external returns (uint256);

    /**
     * @dev Harvests rewards and compounds them back into the strategy
     * @return The amount of rewards harvested
     */
    function harvest() external returns (uint256);

    /**
     * @dev Returns the balance of underlying tokens held by this strategy
     */
    function balanceOf() external returns (uint256);

    /**
     * @dev Returns whether the strategy is active
     */
    function isActive() external view returns (bool);

    /**
     * @dev Pauses the strategy (only callable by vault)
     */
    function pause() external;

    /**
     * @dev Unpauses the strategy (only callable by vault)
     */
    function unpause() external;

    /**
     * @dev Returns the vault address that owns this strategy
     */
    function vault() external view returns (address);

    /**
     * @dev Emitted when assets are deposited into the strategy
     */
    event Deposited(uint256 amount);

    /**
     * @dev Emitted when assets are withdrawn from the strategy
     */
    event Withdrawn(uint256 amount);

    /**
     * @dev Emitted when rewards are harvested
     */
    event Harvested(uint256 rewards);

    /**
     * @dev Emitted when strategy is paused
     */
    event Paused();

    /**
     * @dev Emitted when strategy is unpaused
     */
    event Unpaused();
}
