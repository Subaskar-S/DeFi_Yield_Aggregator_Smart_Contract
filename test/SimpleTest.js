const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple Compilation Test", function () {
  it("Should deploy MockERC20", async function () {
    const [owner] = await ethers.getSigners();
    
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const dai = await MockERC20.deploy(
      "Dai Stablecoin", 
      "DAI", 
      18, 
      ethers.utils.parseEther("1000000")
    );
    
    expect(await dai.name()).to.equal("Dai Stablecoin");
    expect(await dai.symbol()).to.equal("DAI");
    expect(await dai.decimals()).to.equal(18);
  });
});
