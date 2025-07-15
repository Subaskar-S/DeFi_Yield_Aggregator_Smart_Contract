const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Basic Compilation Test", function () {
    let mockERC20;
    let owner;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        // Deploy a simple mock ERC20 token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockERC20 = await MockERC20.deploy("Test Token", "TEST", 18);
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
});
