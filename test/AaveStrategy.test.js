const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AaveStrategy", function () {
  let strategy, vault, dai, lendingPool, aDAI, addressesProvider;
  let owner, user1;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, ethers.utils.parseEther("1000000"));

    // Deploy mock Aave contracts
    const MockLendingPool = await ethers.getContractFactory("MockLendingPool");
    const MockAToken = await ethers.getContractFactory("MockAToken");
    const MockLendingPoolAddressesProvider = await ethers.getContractFactory("MockLendingPoolAddressesProvider");

    lendingPool = await MockLendingPool.deploy();
    addressesProvider = await MockLendingPoolAddressesProvider.deploy(lendingPool.address);
    aDAI = await MockAToken.deploy(dai.address, lendingPool.address, "Aave DAI", "aDAI");

    // Set up Aave
    await lendingPool.setAToken(dai.address, aDAI.address);
    await lendingPool.setLiquidityRate(dai.address, ethers.utils.parseUnits("0.05", 27)); // 5% APY

    // Deploy a mock vault (we'll use owner as vault for simplicity)
    vault = owner;

    // Deploy AaveStrategy
    const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
    strategy = await AaveStrategy.deploy(
      dai.address,
      vault.address,
      lendingPool.address,
      aDAI.address,
      addressesProvider.address,
      owner.address
    );

    // Fund mock protocol with DAI
    await dai.transfer(lendingPool.address, ethers.utils.parseEther("100000"));
    
    // Give strategy some DAI for testing
    await dai.transfer(strategy.address, ethers.utils.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct underlying token", async function () {
      expect(await strategy.underlying()).to.equal(dai.address);
    });

    it("Should set the correct vault", async function () {
      expect(await strategy.vault()).to.equal(vault.address);
    });

    it("Should set the correct lending pool", async function () {
      expect(await strategy.lendingPool()).to.equal(lendingPool.address);
    });

    it("Should set the correct aToken", async function () {
      expect(await strategy.aToken()).to.equal(aDAI.address);
    });

    it("Should be active initially", async function () {
      expect(await strategy.isActive()).to.be.true;
    });

    it("Should have correct name", async function () {
      expect(await strategy.name()).to.equal("Aave Strategy");
    });
  });

  describe("Deposits", function () {
    it("Should deposit tokens to Aave", async function () {
      const depositAmount = ethers.utils.parseEther("100");
      
      const balanceBefore = await strategy.totalAssets();
      await strategy.deposit(depositAmount);
      const balanceAfter = await strategy.totalAssets();
      
      expect(balanceAfter.sub(balanceBefore)).to.equal(depositAmount);
      expect(await strategy.getATokenBalance()).to.equal(depositAmount);
    });

    it("Should reject deposits when paused", async function () {
      await strategy.pause();
      
      await expect(
        strategy.deposit(ethers.utils.parseEther("100"))
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should reject deposits when not active", async function () {
      await strategy.setActive(false);
      
      await expect(
        strategy.deposit(ethers.utils.parseEther("100"))
      ).to.be.revertedWith("BaseStrategy: strategy is not active");
    });

    it("Should reject zero deposits", async function () {
      await expect(
        strategy.deposit(0)
      ).to.be.revertedWith("BaseStrategy: amount must be greater than 0");
    });

    it("Should only allow vault to deposit", async function () {
      await expect(
        strategy.connect(user1).deposit(ethers.utils.parseEther("100"))
      ).to.be.revertedWith("BaseStrategy: caller is not the vault");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Make a deposit first
      await strategy.deposit(ethers.utils.parseEther("500"));
    });

    it("Should withdraw tokens from Aave", async function () {
      const withdrawAmount = ethers.utils.parseEther("100");
      
      const balanceBefore = await strategy.totalAssets();
      await strategy.withdraw(withdrawAmount);
      const balanceAfter = await strategy.totalAssets();
      
      expect(balanceBefore.sub(balanceAfter)).to.equal(withdrawAmount);
    });

    it("Should withdraw all tokens", async function () {
      const totalBefore = await strategy.totalAssets();
      expect(totalBefore).to.be.gt(0);
      
      await strategy.withdrawAll();
      
      const totalAfter = await strategy.totalAssets();
      expect(totalAfter).to.equal(0);
      expect(await strategy.getATokenBalance()).to.equal(0);
    });

    it("Should handle partial withdrawals when insufficient balance", async function () {
      const totalAssets = await strategy.totalAssets();
      const withdrawAmount = totalAssets.add(ethers.utils.parseEther("100")); // More than available
      
      const withdrawn = await strategy.callStatic.withdraw(withdrawAmount);
      expect(withdrawn).to.equal(totalAssets); // Should withdraw all available
    });

    it("Should reject zero withdrawals", async function () {
      await expect(
        strategy.withdraw(0)
      ).to.be.revertedWith("BaseStrategy: amount must be greater than 0");
    });

    it("Should only allow vault to withdraw", async function () {
      await expect(
        strategy.connect(user1).withdraw(ethers.utils.parseEther("100"))
      ).to.be.revertedWith("BaseStrategy: caller is not the vault");
    });
  });

  describe("Harvesting", function () {
    beforeEach(async function () {
      // Make a deposit first
      await strategy.deposit(ethers.utils.parseEther("500"));
    });

    it("Should harvest (no-op for Aave V2)", async function () {
      // Aave V2 doesn't have native rewards, so harvest should return 0
      const rewards = await strategy.callStatic.harvest();
      expect(rewards).to.equal(0);
      
      // Should not revert
      await strategy.harvest();
    });

    it("Should allow anyone to harvest", async function () {
      await strategy.connect(user1).harvest();
      // Should not revert
    });

    it("Should reject harvest when paused", async function () {
      await strategy.pause();
      
      await expect(
        strategy.harvest()
      ).to.be.revertedWith("BaseStrategy: strategy is paused");
    });
  });

  describe("APY Calculation", function () {
    it("Should return current APY", async function () {
      const apy = await strategy.currentAPY();
      expect(apy).to.be.gt(0);
    });

    it("Should calculate APY from liquidity rate", async function () {
      const liquidityRate = await strategy.getCurrentLiquidityRate();
      expect(liquidityRate).to.be.gt(0);
      
      const apy = await strategy.currentAPY();
      expect(apy).to.be.gt(0);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await strategy.deposit(ethers.utils.parseEther("500"));
    });

    it("Should return correct total assets", async function () {
      const totalAssets = await strategy.totalAssets();
      expect(totalAssets).to.equal(ethers.utils.parseEther("500"));
    });

    it("Should return correct balance", async function () {
      const balance = await strategy.balanceOf();
      expect(balance).to.equal(ethers.utils.parseEther("500"));
    });

    it("Should return aToken balance", async function () {
      const aTokenBalance = await strategy.getATokenBalance();
      expect(aTokenBalance).to.equal(ethers.utils.parseEther("500"));
    });

    it("Should return user account data", async function () {
      const accountData = await strategy.getUserAccountData();
      expect(accountData.totalCollateralETH).to.equal(0);
      expect(accountData.totalDebtETH).to.equal(0);
      expect(accountData.healthFactor).to.equal(ethers.constants.MaxUint256);
    });

    it("Should return reserve data", async function () {
      const reserveData = await strategy.getReserveData();
      expect(reserveData.aTokenAddress).to.equal(aDAI.address);
      expect(reserveData.currentLiquidityRate).to.be.gt(0);
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to pause", async function () {
      await expect(
        strategy.connect(user1).pause()
      ).to.be.revertedWith("BaseStrategy: caller is not vault or owner");
    });

    it("Should only allow owner to set active status", async function () {
      await expect(
        strategy.connect(user1).setActive(false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should only allow owner to set performance fee", async function () {
      await expect(
        strategy.connect(user1).setPerformanceFee(1500)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should reject performance fee above maximum", async function () {
      await expect(
        strategy.setPerformanceFee(2500) // 25% > 20% max
      ).to.be.revertedWith("BaseStrategy: performance fee too high");
    });

    it("Should only allow owner to recover tokens", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const randomToken = await MockERC20.deploy("Random", "RND", 18, ethers.utils.parseEther("1000"));
      
      await expect(
        strategy.connect(user1).recoverToken(randomToken.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should reject recovering underlying or aToken", async function () {
      await expect(
        strategy.recoverToken(dai.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("AaveStrategy: cannot recover underlying");
      
      await expect(
        strategy.recoverToken(aDAI.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("AaveStrategy: cannot recover aToken");
    });
  });
});
