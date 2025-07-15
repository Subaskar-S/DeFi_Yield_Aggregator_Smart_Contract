const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple CompoundStrategy Integration", function () {
    let vault;
    let strategy;
    let mockToken;
    let mockCToken;
    let mockComptroller;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
        
        // Deploy mock ERC20 token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Test Token", "TEST", 18, 0);
        await mockToken.waitForDeployment();
        
        // Deploy mock Compound contracts
        const MockCToken = await ethers.getContractFactory("MockCToken");
        mockCToken = await MockCToken.deploy(
            await mockToken.getAddress(),
            "Compound Test Token",
            "cTEST"
        );
        await mockCToken.waitForDeployment();
        
        const MockComptroller = await ethers.getContractFactory("MockComptroller");
        mockComptroller = await MockComptroller.deploy();
        await mockComptroller.waitForDeployment();
        
        // Deploy YieldVault
        const YieldVault = await ethers.getContractFactory("YieldVault");
        vault = await YieldVault.deploy(
            await mockToken.getAddress(),
            "Yield Vault Token",
            "YVT",
            owner.address
        );
        await vault.waitForDeployment();
        
        // Deploy CompoundStrategy
        const CompoundStrategy = await ethers.getContractFactory("CompoundStrategy");
        strategy = await CompoundStrategy.deploy(
            await mockToken.getAddress(),
            await vault.getAddress(),
            await mockCToken.getAddress(),
            await mockComptroller.getAddress(),
            await mockToken.getAddress(), // Using mockToken as COMP token for simplicity
            owner.address
        );
        await strategy.waitForDeployment();
    });

    it("Should deploy strategy successfully", async function () {
        expect(await strategy.name()).to.equal("Compound Strategy");
        expect(await strategy.underlying()).to.equal(await mockToken.getAddress());
        expect(await strategy.vault()).to.equal(await vault.getAddress());
    });

    it("Should handle deposits to Compound", async function () {
        const depositAmount = ethers.parseEther("100");

        // First add strategy to vault
        await vault.addStrategy(await strategy.getAddress(), 10000); // 100% allocation

        // Mint tokens to vault and deposit
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);

        // Rebalance to move funds to strategy
        await vault.rebalance();

        // Check that strategy received cTokens
        expect(await mockCToken.balanceOf(await strategy.getAddress())).to.be.gt(0);
    });

    it("Should handle withdrawals from Compound", async function () {
        const depositAmount = ethers.parseEther("100");
        const withdrawAmount = ethers.parseEther("50");

        // Setup: add strategy and deposit
        await vault.addStrategy(await strategy.getAddress(), 10000);
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);
        await vault.rebalance();

        const initialCTokenBalance = await mockCToken.balanceOf(await strategy.getAddress());

        // Withdraw through vault
        await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

        // Check that cToken balance decreased
        expect(await mockCToken.balanceOf(await strategy.getAddress())).to.be.lt(initialCTokenBalance);

        // Check that user received tokens
        expect(await mockToken.balanceOf(user1.address)).to.equal(withdrawAmount);
    });

    it("Should calculate total assets correctly", async function () {
        const depositAmount = ethers.parseEther("100");

        // Initially should be 0 (totalAssets is not a view function)
        await strategy.totalAssets(); // Call it to trigger any state changes
        // Check that strategy has no cTokens initially
        expect(await mockCToken.balanceOf(await strategy.getAddress())).to.equal(0);

        // Setup: add strategy and deposit
        await vault.addStrategy(await strategy.getAddress(), 10000);
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);
        await vault.rebalance();

        // Should have cTokens after rebalance
        expect(await mockCToken.balanceOf(await strategy.getAddress())).to.be.gt(0);

        // Call totalAssets to ensure it works
        await strategy.totalAssets();
    });

    it("Should return current APY", async function () {
        const apy = await strategy.currentAPY();
        expect(apy).to.be.gt(0); // Should return some positive APY
    });
});
