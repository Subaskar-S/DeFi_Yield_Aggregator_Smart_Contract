const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("YieldVault", function () {
  let vault, dai, usdc, weth, comp;
  let compoundStrategy, aaveStrategy;
  let cDAI, comptroller, lendingPool, aDAI, addressesProvider;
  let owner, user1, user2, feeRecipient;

  beforeEach(async function () {
    [owner, user1, user2, feeRecipient] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, ethers.utils.parseEther("1000000"));
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6, ethers.utils.parseUnits("1000000", 6));
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18, ethers.utils.parseEther("10000"));
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
  });

  describe("Deployment", function () {
    it("Should set the correct underlying token", async function () {
      expect(await vault.underlying()).to.equal(dai.address);
    });

    it("Should set the correct name and symbol", async function () {
      expect(await vault.name()).to.equal("Yield Vault DAI");
      expect(await vault.symbol()).to.equal("yvDAI");
    });

    it("Should set the correct owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("Should have zero total assets initially", async function () {
      expect(await vault.totalAssets()).to.equal(0);
    });

    it("Should have zero total supply initially", async function () {
      expect(await vault.totalSupply()).to.equal(0);
    });
  });

  describe("Strategy Management", function () {
    it("Should add strategies correctly", async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await vault.addStrategy(aaveStrategy.address, 5000);

      const strategies = await vault.getStrategies();
      expect(strategies.length).to.equal(2);
      expect(strategies[0]).to.equal(compoundStrategy.address);
      expect(strategies[1]).to.equal(aaveStrategy.address);

      expect(await vault.getAllocation(compoundStrategy.address)).to.equal(5000);
      expect(await vault.getAllocation(aaveStrategy.address)).to.equal(5000);
      expect(await vault.totalAllocation()).to.equal(10000);
    });

    it("Should reject adding strategy with zero allocation", async function () {
      await expect(
        vault.addStrategy(compoundStrategy.address, 0)
      ).to.be.revertedWith("YieldVault: allocation must be greater than 0");
    });

    it("Should reject adding strategy that exceeds 100% allocation", async function () {
      await vault.addStrategy(compoundStrategy.address, 10000);
      await expect(
        vault.addStrategy(aaveStrategy.address, 1)
      ).to.be.revertedWith("YieldVault: total allocation exceeds 100%");
    });

    it("Should reject adding duplicate strategy", async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await expect(
        vault.addStrategy(compoundStrategy.address, 5000)
      ).to.be.revertedWith("YieldVault: strategy already exists");
    });

    it("Should update strategy allocation", async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await vault.addStrategy(aaveStrategy.address, 5000);

      await vault.updateAllocation(compoundStrategy.address, 7000);
      await vault.updateAllocation(aaveStrategy.address, 3000);

      expect(await vault.getAllocation(compoundStrategy.address)).to.equal(7000);
      expect(await vault.getAllocation(aaveStrategy.address)).to.equal(3000);
      expect(await vault.totalAllocation()).to.equal(10000);
    });

    it("Should remove strategy correctly", async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await vault.addStrategy(aaveStrategy.address, 5000);

      await vault.removeStrategy(compoundStrategy.address);

      const strategies = await vault.getStrategies();
      expect(strategies.length).to.equal(1);
      expect(strategies[0]).to.equal(aaveStrategy.address);
      expect(await vault.getAllocation(compoundStrategy.address)).to.equal(0);
      expect(await vault.totalAllocation()).to.equal(5000);
    });
  });

  describe("Deposits and Withdrawals", function () {
    beforeEach(async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await vault.addStrategy(aaveStrategy.address, 5000);
    });

    it("Should allow deposits", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await vault.totalSupply()).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.be.closeTo(depositAmount, ethers.utils.parseEther("1"));
    });

    it("Should deploy funds to strategies on deposit", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Check that funds were deployed to strategies
      const compoundAssets = await compoundStrategy.totalAssets();
      const aaveAssets = await aaveStrategy.totalAssets();
      
      expect(compoundAssets).to.be.gt(0);
      expect(aaveAssets).to.be.gt(0);
      expect(compoundAssets.add(aaveAssets)).to.be.closeTo(depositAmount, ethers.utils.parseEther("1"));
    });

    it("Should allow withdrawals", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      const withdrawAmount = ethers.utils.parseEther("500");
      
      // Deposit first
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const balanceBefore = await dai.balanceOf(user1.address);
      
      // Withdraw
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

      const balanceAfter = await dai.balanceOf(user1.address);
      expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(withdrawAmount, ethers.utils.parseEther("1"));
      
      expect(await vault.balanceOf(user1.address)).to.be.closeTo(
        depositAmount.sub(withdrawAmount), 
        ethers.utils.parseEther("1")
      );
    });

    it("Should allow redeeming shares", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      
      // Deposit first
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      const redeemShares = shares.div(2);
      
      const balanceBefore = await dai.balanceOf(user1.address);
      
      // Redeem half the shares
      await vault.connect(user1).redeem(redeemShares, user1.address, user1.address);

      const balanceAfter = await dai.balanceOf(user1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
      
      expect(await vault.balanceOf(user1.address)).to.be.closeTo(redeemShares, ethers.utils.parseEther("1"));
    });

    it("Should reject deposits below minimum", async function () {
      const minDeposit = await vault.minDeposit();
      const smallAmount = minDeposit.sub(1);

      await dai.connect(user1).approve(vault.address, smallAmount);
      await expect(
        vault.connect(user1).deposit(smallAmount, user1.address)
      ).to.be.revertedWith("YieldVault: deposit below minimum");
    });
  });

  describe("Emergency Functions", function () {
    beforeEach(async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await vault.addStrategy(aaveStrategy.address, 5000);

      // Make a deposit
      const depositAmount = ethers.utils.parseEther("1000");
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should allow emergency withdrawal when paused", async function () {
      // Pause the vault
      await vault.pause();

      const balanceBefore = await dai.balanceOf(user1.address);
      const shares = await vault.balanceOf(user1.address);

      // Emergency withdraw
      await vault.connect(user1).emergencyWithdraw(user1.address);

      const balanceAfter = await dai.balanceOf(user1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(await vault.balanceOf(user1.address)).to.equal(0);
    });

    it("Should reject emergency withdrawal when not paused", async function () {
      await expect(
        vault.connect(user1).emergencyWithdraw(user1.address)
      ).to.be.revertedWith("Pausable: not paused");
    });

    it("Should reject normal operations when paused", async function () {
      await vault.pause();

      await dai.connect(user2).approve(vault.address, ethers.utils.parseEther("100"));
      await expect(
        vault.connect(user2).deposit(ethers.utils.parseEther("100"), user2.address)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Share Calculations", function () {
    beforeEach(async function () {
      await vault.addStrategy(compoundStrategy.address, 10000); // 100% to compound for simplicity
    });

    it("Should calculate shares correctly for first deposit", async function () {
      const depositAmount = ethers.utils.parseEther("1000");

      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await vault.convertToShares(depositAmount)).to.equal(depositAmount);
      expect(await vault.convertToAssets(depositAmount)).to.equal(depositAmount);
    });

    it("Should calculate shares correctly after yield accrual", async function () {
      const depositAmount = ethers.utils.parseEther("1000");

      // First deposit
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Simulate yield by increasing exchange rate in mock cToken
      await cDAI.exchangeRateCurrent(); // This increases the exchange rate

      // Second deposit should get fewer shares due to increased asset value
      await dai.connect(user2).approve(vault.address, depositAmount);
      await vault.connect(user2).deposit(depositAmount, user2.address);

      const user1Shares = await vault.balanceOf(user1.address);
      const user2Shares = await vault.balanceOf(user2.address);

      expect(user1Shares).to.be.gt(user2Shares); // User1 should have more shares
    });
  });

  describe("Rebalancing", function () {
    beforeEach(async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);
      await vault.addStrategy(aaveStrategy.address, 5000);

      // Make a deposit
      const depositAmount = ethers.utils.parseEther("1000");
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should rebalance funds according to new allocations", async function () {
      // Change allocations
      await vault.updateAllocation(compoundStrategy.address, 8000);
      await vault.updateAllocation(aaveStrategy.address, 2000);

      // Rebalance
      await vault.rebalance();

      const compoundAssets = await compoundStrategy.totalAssets();
      const aaveAssets = await aaveStrategy.totalAssets();
      const totalAssets = compoundAssets.add(aaveAssets);

      // Check that allocations are approximately correct (allowing for small rounding errors)
      const compoundRatio = compoundAssets.mul(10000).div(totalAssets);
      const aaveRatio = aaveAssets.mul(10000).div(totalAssets);

      expect(compoundRatio).to.be.closeTo(8000, 100); // Within 1% tolerance
      expect(aaveRatio).to.be.closeTo(2000, 100);
    });
  });

  describe("Harvesting", function () {
    beforeEach(async function () {
      await vault.addStrategy(compoundStrategy.address, 10000);

      // Make a deposit
      const depositAmount = ethers.utils.parseEther("1000");
      await dai.connect(user1).approve(vault.address, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Set up COMP rewards
      await comp.transfer(comptroller.address, ethers.utils.parseEther("1000"));
      await comptroller.setCompBalance(compoundStrategy.address, ethers.utils.parseEther("10"));
    });

    it("Should harvest rewards from strategies", async function () {
      // Fast forward time to allow harvest
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 24 hours
      await ethers.provider.send("evm_mine");

      const tx = await vault.harvestAll();
      const receipt = await tx.wait();

      // Check that HarvestedAll event was emitted
      const harvestEvent = receipt.events.find(e => e.event === 'HarvestedAll');
      expect(harvestEvent).to.not.be.undefined;
    });

    it("Should reject harvest if called too soon", async function () {
      await expect(vault.harvestAll()).to.be.revertedWith("YieldVault: harvest too soon");
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to add strategies", async function () {
      await expect(
        vault.connect(user1).addStrategy(compoundStrategy.address, 5000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should only allow owner to remove strategies", async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);

      await expect(
        vault.connect(user1).removeStrategy(compoundStrategy.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should only allow owner to pause/unpause", async function () {
      await expect(
        vault.connect(user1).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await vault.pause();

      await expect(
        vault.connect(user1).unpause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should only allow owner to rebalance", async function () {
      await vault.addStrategy(compoundStrategy.address, 5000);

      await expect(
        vault.connect(user1).rebalance()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
