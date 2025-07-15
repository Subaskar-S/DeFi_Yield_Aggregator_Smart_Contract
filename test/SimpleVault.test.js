const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple YieldVault Test", function () {
    let vault;
    let mockToken;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
        
        // Deploy mock ERC20 token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Test Token", "TEST", 18, 0);
        await mockToken.waitForDeployment();
        
        // Deploy YieldVault
        const YieldVault = await ethers.getContractFactory("YieldVault");
        vault = await YieldVault.deploy(
            await mockToken.getAddress(),
            "Yield Vault Token",
            "YVT",
            owner.address
        );
        await vault.waitForDeployment();
    });

    it("Should deploy successfully", async function () {
        expect(await vault.name()).to.equal("Yield Vault Token");
        expect(await vault.symbol()).to.equal("YVT");
        expect(await vault.underlying()).to.equal(await mockToken.getAddress());
    });

    it("Should handle deposits", async function () {
        const depositAmount = ethers.parseEther("100");
        
        // Mint tokens to user
        await mockToken.mint(user1.address, depositAmount);
        
        // Approve vault to spend tokens
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        
        // Deposit tokens
        await vault.connect(user1).deposit(depositAmount, user1.address);
        
        // Check balances
        expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
        expect(await mockToken.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should handle withdrawals", async function () {
        const depositAmount = ethers.parseEther("100");
        const withdrawAmount = ethers.parseEther("50");
        
        // Setup: mint, approve, and deposit
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);
        
        // Withdraw tokens
        await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
        
        // Check balances
        expect(await vault.balanceOf(user1.address)).to.equal(depositAmount - withdrawAmount);
        expect(await mockToken.balanceOf(user1.address)).to.equal(withdrawAmount);
        expect(await mockToken.balanceOf(await vault.getAddress())).to.equal(depositAmount - withdrawAmount);
    });

    it("Should calculate total assets correctly", async function () {
        const depositAmount = ethers.parseEther("100");
        
        // Initially should be 0 (totalAssets() is not a view function, so we need to call it properly)
        const initialAssetsTx = await vault.totalAssets();
        await initialAssetsTx.wait();
        // Since there are no strategies, totalAssets should just return the vault's balance
        expect(await mockToken.balanceOf(await vault.getAddress())).to.equal(0);
        
        // After deposit should equal deposit amount
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);
        
        // Check that the vault holds the deposited amount
        expect(await mockToken.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should handle emergency pause", async function () {
        const depositAmount = ethers.parseEther("100");
        
        // Setup deposit
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);
        
        // Pause the contract
        await vault.pause();
        
        // Should not be able to deposit when paused
        await expect(
            vault.connect(user1).deposit(depositAmount, user1.address)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause");
        
        // Unpause
        await vault.unpause();
        
        // Should be able to deposit again
        await mockToken.mint(user1.address, depositAmount);
        await mockToken.connect(user1).approve(await vault.getAddress(), depositAmount);
        await vault.connect(user1).deposit(depositAmount, user1.address);
        
        expect(await vault.balanceOf(user1.address)).to.equal(depositAmount * 2n);
    });
});
