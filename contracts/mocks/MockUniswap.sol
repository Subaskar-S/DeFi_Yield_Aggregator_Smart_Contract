// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniswapV2Pair is ERC20 {
    address public token0;
    address public token1;
    
    constructor(address _token0, address _token1) ERC20("Uniswap V2", "UNI-V2") {
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (1e18, 1e18, uint32(block.timestamp));
    }

    function mint(address to) external returns (uint liquidity) {
        uint balance0 = IERC20(token0).balanceOf(address(this));
        uint balance1 = IERC20(token1).balanceOf(address(this));
        
        liquidity = balance0 + balance1; // Simplified calculation
        _mint(to, liquidity);
    }

    function burn(address to) external returns (uint amount0, uint amount1) {
        uint liquidity = balanceOf(address(this));
        uint totalSupply = totalSupply();
        
        amount0 = (liquidity * IERC20(token0).balanceOf(address(this))) / totalSupply;
        amount1 = (liquidity * IERC20(token1).balanceOf(address(this))) / totalSupply;
        
        _burn(address(this), liquidity);
        IERC20(token0).transfer(to, amount0);
        IERC20(token1).transfer(to, amount1);
    }
}

contract MockUniswapV2Router {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint,
        uint,
        address,
        uint
    ) external returns (uint amountA, uint amountB, uint liquidity) {
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);
        
        // Simplified: return the desired amounts
        amountA = amountADesired;
        amountB = amountBDesired;
        liquidity = amountA + amountB;
        
        // Mock minting LP tokens to the user
        // In reality, this would be done by the pair contract
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint,
        uint,
        address to,
        uint
    ) external returns (uint amountA, uint amountB) {
        // Simplified removal
        amountA = liquidity / 2;
        amountB = liquidity / 2;
        
        IERC20(tokenA).transfer(to, amountA);
        IERC20(tokenB).transfer(to, amountB);
    }
}

contract MockUniswapV2Factory {
    mapping(address => mapping(address => address)) public getPair;
    
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        pair = address(new MockUniswapV2Pair(tokenA, tokenB));
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }
}
