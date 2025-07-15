const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CompoundStrategy", function () {
  let strategy, vault, dai, comp, cDAI, comptroller;
  let owner, user1;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18, ethers.utils.parseEther("1000000"));
    comp = await MockERC20.deploy("Compound", "COMP", 18, ethers.utils.parseEther("100000"));

    // Deploy mock Compound contracts
    const MockComptroller = await ethers.getContractFactory("MockComptroller");
    const MockCToken = await ethers.getContractFactory("MockCToken");
    
    comptroller = await MockComptroller.deploy(comp.address);
    cDAI = await MockCToken.deploy(dai.address, "Compound DAI", "cDAI");

    // Deploy a mock vault (we'll use owner as vault for simplicity)
    vault = owner;

    // Deploy CompoundStrategy
    const CompoundStrategy = await ethers.getContractFactory("CompoundStrategy");
    strategy = await CompoundStrategy.deploy(
      dai.address,
      vault.address,
      cDAI.address,
      comptroller.address,
      comp.address,
      owner.address
    );

    // Fund mock protocol with DAI
    await dai.transfer(cDAI.address, ethers.utils.parseEther("100000"));
    
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

    it("Should set the correct cToken", async function () {
      expect(await strategy.cToken()).to.equal(cDAI.address);
    });

    it("Should be active initially", async function () {
      expect(await strategy.isActive()).to.be.true;
    });

    it("Should have correct name", async function () {
      expect(await strategy.name()).to.equal("Compound Strategy");
    });
  });

  describe("Deposits", function () {
    it("Should deposit tokens to Compound", async function () {
      const depositAmount = ethers.utils.parseEther("100");
      
      const balanceBefore = await strategy.totalAssets();
      await strategy.deposit(depositAmount);
      const balanceAfter = await strategy.totalAssets();
      
      expect(balanceAfter.sub(balanceBefore)).to.equal(depositAmount);
      expect(await strategy.getCTokenBalance()).to.be.gt(0);
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

    it("Should withdraw tokens from Compound", async function () {
      const withdrawAmount = ethers.utils.parseEther("100");
      
      const balanceBefore = await strategy.totalAssets();
      await strategy.withdraw(withdrawAmount);
      const balanceAfter = await strategy.totalAssets();
      
      expect(balanceBefore.sub(balanceAfter)).to.be.closeTo(withdrawAmount, ethers.utils.parseEther("1"));
    });

    it("Should withdraw all tokens", async function () {
      const totalBefore = await strategy.totalAssets();
      expect(totalBefore).to.be.gt(0);
      
      await strategy.withdrawAll();
      
      const totalAfter = await strategy.totalAssets();
      expect(totalAfter).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
      expect(await strategy.getCTokenBalance()).to.equal(0);
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
      
      // Set up COMP rewards
      await comp.transfer(comptroller.address, ethers.utils.parseEther("1000"));
      await comptroller.setCompBalance(strategy.address, ethers.utils.parseEther("10"));
    });

    it("Should harvest COMP rewards", async function () {
      const compBefore = await strategy.getCompBalance();
      expect(compBefore).to.equal(0);
      
      await strategy.harvest();
      
      // In our mock, harvest doesn't actually swap COMP to underlying
      // but it should claim the COMP tokens
      const accruedComp = await strategy.getAccruedComp();
      expect(accruedComp).to.equal(0); // Should be claimed
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

    it("Should only allow owner to exit market", async function () {
      await expect(
        strategy.connect(user1).exitMarket()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should only allow owner to recover tokens", async function () {
      await expect(
        strategy.connect(user1).recoverToken(comp.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should reject recovering underlying or cToken", async function () {
      await expect(
        strategy.recoverToken(dai.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("CompoundStrategy: cannot recover underlying");
      
      await expect(
        strategy.recoverToken(cDAI.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("CompoundStrategy: cannot recover cToken");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await strategy.deposit(ethers.utils.parseEther("500"));
    });

    it("Should return correct total assets", async function () {
      const totalAssets = await strategy.totalAssets();
      expect(totalAssets).to.be.gt(0);
    });

    it("Should return correct balance", async function () {
      const balance = await strategy.balanceOf();
      expect(balance).to.be.gt(0);
    });

    it("Should return exchange rate", async function () {
      const exchangeRate = await strategy.getExchangeRate();
      expect(exchangeRate).to.be.gt(0);
    });

    it("Should return supply rate per block", async function () {
      const supplyRate = await strategy.getSupplyRatePerBlock();
      expect(supplyRate).to.be.gt(0);
    });
  });
});
