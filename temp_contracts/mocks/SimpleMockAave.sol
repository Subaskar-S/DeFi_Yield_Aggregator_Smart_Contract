// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleMockAToken is ERC20 {
    address public immutable UNDERLYING_ASSET_ADDRESS;
    address public immutable POOL;
    
    constructor(
        address _underlying,
        address _pool,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        UNDERLYING_ASSET_ADDRESS = _underlying;
        POOL = _pool;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

contract SimpleMockLendingPool {
    mapping(address => address) public aTokens;
    mapping(address => uint128) public liquidityRates;
    
    function setAToken(address asset, address aToken) external {
        aTokens[asset] = aToken;
    }

    function setLiquidityRate(address asset, uint128 rate) external {
        liquidityRates[asset] = rate;
    }

    function deposit(address asset, uint256 amount, address onBehalfOf, uint16) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        SimpleMockAToken(aTokens[asset]).mint(onBehalfOf, amount);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        SimpleMockAToken(aTokens[asset]).burn(msg.sender, amount);
        IERC20(asset).transfer(to, amount);
        return amount;
    }

    function getReserveData(address asset) external view returns (
        uint256, uint128, uint128, uint128, uint128, uint128, uint40, address, address, address, address, uint8
    ) {
        return (0, 1e27, 1e27, liquidityRates[asset], 0, 0, 0, aTokens[asset], address(0), address(0), address(0), 0);
    }

    function borrow(address, uint256, uint256, uint16, address) external {}
    function repay(address, uint256, uint256, address) external returns (uint256) { return 0; }
    function getUserAccountData(address) external pure returns (uint256, uint256, uint256, uint256, uint256, uint256) {
        return (0, 0, 0, 0, 0, type(uint256).max);
    }
}

contract SimpleMockLendingPoolAddressesProvider {
    address private lendingPool;
    
    constructor(address _lendingPool) {
        lendingPool = _lendingPool;
    }

    function getLendingPool() external view returns (address) {
        return lendingPool;
    }

    function getPriceOracle() external pure returns (address) {
        return address(0);
    }

    function getLendingRateOracle() external pure returns (address) {
        return address(0);
    }
}
