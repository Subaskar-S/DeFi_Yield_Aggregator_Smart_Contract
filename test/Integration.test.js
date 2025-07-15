const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration Tests", function () {
  let vault, dai, comp;
  let compoundStrategy, aaveStrategy;
  let cDAI, comptroller, lendingPool, aDAI, addressesProvider;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, ethers.utils.parseEther("1000000"));
    comp = await MockERC20.deploy("Compound", "COMP", 18, ethers.utils.parseEther("100000"));

    // Deploy mock Compound contracts
    const MockComptroller = await ethers.getContractFactory("MockComptroller");
    const MockCToken = await ethers.getContractFactory("MockCToken");
    
    comptroller = await MockComptroller.deploy(comp.address);
    cDAI = await MockCToken.deploy(dai.address, "Compound DAI", "cDAI");

    // Deploy mock Aave contracts
    const MockLendingPool = await ethers.getContractFactory("MockLendingPool");
    const MockAToken = await ethers.getContractFactory("MockAToken");
    const MockLendingPoolAddressesProvider = await ethers.getContractFactory("MockLendingPoolAddressesProvider");

    lendingPool = await MockLendingPool.deploy();
    addressesProvider = await MockLendingPoolAddressesProvider.deploy(lendingPool.address);
    aDAI = await MockAToken.deploy(dai.address, lendingPool.address, "Aave DAI", "aDAI");

    // Set up Aave
    await lendingPool.setAToken(dai.address, aDAI.address);
    await lendingPool.setLiquidityRate(dai.address, ethers.utils.parseUnits("0.05", 27));

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    vault = await YieldVault.deploy(dai.address, "Yield Vault DAI", "yvDAI", owner.address);

    // Deploy strategies
    const CompoundStrategy = await ethers.getContractFactory("CompoundStrategy");
    compoundStrategy = await CompoundStrategy.deploy(
      dai.address,
      vault.address,
      cDAI.address,
      comptroller.address,
      comp.address,
      owner.address
    );

    const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
    aaveStrategy = await AaveStrategy.deploy(
      dai.address,
      vault.address,
      lendingPool.address,
      aDAI.address,
      addressesProvider.address,
      owner.address
    );

    // Fund mock protocols with DAI
    await dai.transfer(cDAI.address, ethers.utils.parseEther("100000"));
    await dai.transfer(lendingPool.address, ethers.utils.parseEther("100000"));

    // Give users some DAI
    await dai.transfer(user1.address, ethers.utils.parseEther("10000"));
    await dai.transfer(user2.address, ethers.utils.parseEther("10000"));

    // Add strategies to vault
    await vault.addStrategy(compoundStrategy.address, 5000); // 50% allocation
    await vault.addStrategy(aaveStrategy.address, 5000); // 50% allocation
  });

  describe("Full User Journey", function () {
    it("Should handle complete deposit, yield accrual, and withdrawal cycle", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      // User 1 deposits
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Check that funds were deployed to strategies
      const compoundAssets = await compoundStrategy.totalAssets();
      const aaveAssets = await aaveStrategy.totalAssets();
      
      expect(compoundAssets).to.be.gt(0);
      expect(aaveAssets).to.be.gt(0);
      expect(compoundAssets.add(aaveAssets)).to.be.closeTo(depositAmount, ethers.utils.parseEther("1"));
      
      // Check user shares
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      
      // Simulate yield accrual by calling exchangeRateCurrent on cDAI
      await cDAI.exchangeRateCurrent();
      
      // Total assets should have increased due to yield
      const totalAssetsAfterYield = await vault.totalAssets();
      expect(totalAssetsAfterYield).to.be.gt(depositAmount);
      
      // User 2 deposits the same amount but should get fewer shares due to yield
      await dai.connect(user2).approve(vault.address, depositAmount);
      await vault.connect(user2).deposit(depositAmount, user2.address);
      
      const user1Shares = await vault.balanceOf(user1.address);
      const user2Shares = await vault.balanceOf(user2.address);
      expect(user1Shares).to.be.gt(user2Shares);
      
      // User 1 withdraws half their position
      const withdrawShares = user1Shares.div(2);
      const balanceBefore = await dai.balanceOf(user1.address);
      
      await vault.connect(user1).redeem(withdrawShares, user1.address, user1.address);
      
      const balanceAfter = await dai.balanceOf(user1.address);
      const withdrawn = balanceAfter.sub(balanceBefore);
      
      // Should have withdrawn more than originally deposited due to yield
      expect(withdrawn).to.be.gt(depositAmount.div(2));
    });

    it("Should handle strategy rebalancing", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      // User deposits
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Check initial allocation (50/50)
      let compoundAssets = await compoundStrategy.totalAssets();
      let aaveAssets = await aaveStrategy.totalAssets();
      let totalAssets = compoundAssets.add(aaveAssets);
      
      expect(compoundAssets.mul(100).div(totalAssets)).to.be.closeTo(50, 5); // ~50%
      expect(aaveAssets.mul(100).div(totalAssets)).to.be.closeTo(50, 5); // ~50%
      
      // Change allocation to 80/20
      await vault.updateAllocation(compoundStrategy.address, 8000);
      await vault.updateAllocation(aaveStrategy.address, 2000);
      
      // Rebalance
      await vault.rebalance();
      
      // Check new allocation
      compoundAssets = await compoundStrategy.totalAssets();
      aaveAssets = await aaveStrategy.totalAssets();
      totalAssets = compoundAssets.add(aaveAssets);
      
      expect(compoundAssets.mul(100).div(totalAssets)).to.be.closeTo(80, 5); // ~80%
      expect(aaveAssets.mul(100).div(totalAssets)).to.be.closeTo(20, 5); // ~20%
    });

    it("Should handle emergency scenarios", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      // User deposits
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Pause the vault (emergency)
      await vault.pause();
      
      // Normal operations should be blocked
      await dai.connect(user2).approve(vault.address, depositAmount);
      await expect(
        vault.connect(user2).deposit(depositAmount, user2.address)
      ).to.be.revertedWith("Pausable: paused");
      
      // But emergency withdrawal should work
      const balanceBefore = await dai.balanceOf(user1.address);
      await vault.connect(user1).emergencyWithdraw(user1.address);
      const balanceAfter = await dai.balanceOf(user1.address);
      
      expect(balanceAfter.sub(balanceBefore)).to.be.gt(0);
      expect(await vault.balanceOf(user1.address)).to.equal(0);
    });

    it("Should handle multiple users with different entry points", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      // User 1 deposits at time 0
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const user1SharesInitial = await vault.balanceOf(user1.address);
      
      // Simulate yield accrual
      await cDAI.exchangeRateCurrent();
      
      // User 2 deposits at time 1 (after yield)
      await dai.connect(user2).approve(vault.address, depositAmount);
      await vault.connect(user2).deposit(depositAmount, user2.address);
      
      const user2Shares = await vault.balanceOf(user2.address);
      
      // User 1 should have more shares for the same deposit amount
      expect(user1SharesInitial).to.be.gt(user2Shares);
      
      // More yield accrual
      await cDAI.exchangeRateCurrent();
      
      // Both users withdraw everything
      const user1BalanceBefore = await dai.balanceOf(user1.address);
      const user2BalanceBefore = await dai.balanceOf(user2.address);
      
      await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address);
      await vault.connect(user2).redeem(await vault.balanceOf(user2.address), user2.address, user2.address);
      
      const user1BalanceAfter = await dai.balanceOf(user1.address);
      const user2BalanceAfter = await dai.balanceOf(user2.address);
      
      const user1Profit = user1BalanceAfter.sub(user1BalanceBefore).sub(depositAmount);
      const user2Profit = user2BalanceAfter.sub(user2BalanceBefore).sub(depositAmount);
      
      // User 1 should have more profit due to earlier entry
      expect(user1Profit).to.be.gt(user2Profit);
    });

    it("Should handle strategy failures gracefully", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      // User deposits
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Pause one strategy to simulate failure
      await compoundStrategy.pause();
      
      // User should still be able to withdraw (from working strategy)
      const withdrawAmount = ethers.utils.parseEther("100");
      const balanceBefore = await dai.balanceOf(user1.address);
      
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
      
      const balanceAfter = await dai.balanceOf(user1.address);
      expect(balanceAfter.sub(balanceBefore)).to.be.gt(0);
    });
  });

  describe("Gas Optimization", function () {
    it("Should batch operations efficiently", async function () {
      const depositAmount = ethers.utils.parseEther("100");
      
      // Multiple small deposits should still be gas efficient
      for (let i = 0; i < 3; i++) {
        await dai.connect(user1).approve(vault.address, depositAmount);
        const tx = await vault.connect(user1).deposit(depositAmount, user1.address);
        const receipt = await tx.wait();
        
        // Gas usage should be reasonable (this is a rough check)
        expect(receipt.gasUsed).to.be.lt(500000);
      }
    });
  });
});
