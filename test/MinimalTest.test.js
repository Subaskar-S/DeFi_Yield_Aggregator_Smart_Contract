const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Minimal Compilation Test", function () {
    let mockERC20;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
        
        // Deploy a simple mock ERC20 token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockERC20 = await MockERC20.deploy("Test Token", "TEST", 18, 0);
        await mockERC20.waitForDeployment();
    });

    it("Should deploy MockERC20 successfully", async function () {
        expect(await mockERC20.name()).to.equal("Test Token");
        expect(await mockERC20.symbol()).to.equal("TEST");
        expect(await mockERC20.decimals()).to.equal(18);
    });

    it("Should mint tokens", async function () {
        const amount = ethers.parseEther("1000");
        await mockERC20.mint(owner.address, amount);
        
        expect(await mockERC20.balanceOf(owner.address)).to.equal(amount);
        expect(await mockERC20.totalSupply()).to.equal(amount);
    });

    it("Should transfer tokens", async function () {
        const amount = ethers.parseEther("1000");
        await mockERC20.mint(owner.address, amount);
        
        const transferAmount = ethers.parseEther("100");
        await mockERC20.transfer(user1.address, transferAmount);
        
        expect(await mockERC20.balanceOf(user1.address)).to.equal(transferAmount);
        expect(await mockERC20.balanceOf(owner.address)).to.equal(amount - transferAmount);
    });

    it("Should approve and transferFrom", async function () {
        const amount = ethers.parseEther("1000");
        await mockERC20.mint(owner.address, amount);
        
        const approveAmount = ethers.parseEther("200");
        await mockERC20.approve(user1.address, approveAmount);
        
        expect(await mockERC20.allowance(owner.address, user1.address)).to.equal(approveAmount);
        
        const transferAmount = ethers.parseEther("50");
        await mockERC20.connect(user1).transferFrom(owner.address, user1.address, transferAmount);
        
        expect(await mockERC20.balanceOf(user1.address)).to.equal(transferAmount);
        expect(await mockERC20.allowance(owner.address, user1.address)).to.equal(approveAmount - transferAmount);
    });
});
