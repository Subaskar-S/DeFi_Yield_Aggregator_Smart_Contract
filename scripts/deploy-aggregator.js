const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Deploying DeFi Yield Aggregator...\n");

    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy Mock ERC20 Token (for testing)
    console.log("📄 Deploying Mock ERC20 Token...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test USDC", "USDC", 6, 0);
    await mockToken.waitForDeployment();
    console.log("✅ Mock ERC20 deployed to:", await mockToken.getAddress());

    // Deploy Mock Compound Contracts
    console.log("\n🏦 Deploying Mock Compound Contracts...");
    const MockCToken = await ethers.getContractFactory("MockCToken");
    const mockCToken = await MockCToken.deploy(
        await mockToken.getAddress(),
        "Compound USDC",
        "cUSDC"
    );
    await mockCToken.waitForDeployment();
    console.log("✅ Mock cToken deployed to:", await mockCToken.getAddress());

    const MockComptroller = await ethers.getContractFactory("MockComptroller");
    const mockComptroller = await MockComptroller.deploy();
    await mockComptroller.waitForDeployment();
    console.log("✅ Mock Comptroller deployed to:", await mockComptroller.getAddress());

    // Deploy YieldVault
    console.log("\n🏛️ Deploying YieldVault...");
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const vault = await YieldVault.deploy(
        await mockToken.getAddress(),
        "Yield Vault USDC",
        "yvUSDC",
        deployer.address
    );
    await vault.waitForDeployment();
    console.log("✅ YieldVault deployed to:", await vault.getAddress());

    // Deploy CompoundStrategy
    console.log("\n📈 Deploying CompoundStrategy...");
    const CompoundStrategy = await ethers.getContractFactory("CompoundStrategy");
    const compoundStrategy = await CompoundStrategy.deploy(
        await mockToken.getAddress(),
        await vault.getAddress(),
        await mockCToken.getAddress(),
        await mockComptroller.getAddress(),
        await mockToken.getAddress(), // Using mockToken as COMP token for simplicity
        deployer.address
    );
    await compoundStrategy.waitForDeployment();
    console.log("✅ CompoundStrategy deployed to:", await compoundStrategy.getAddress());

    // Add strategy to vault
    console.log("\n⚙️ Configuring Vault...");
    await vault.addStrategy(await compoundStrategy.getAddress(), 10000); // 100% allocation
    console.log("✅ CompoundStrategy added to vault with 100% allocation");

    // Mint some test tokens to deployer
    console.log("\n💰 Minting test tokens...");
    const mintAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    await mockToken.mint(deployer.address, mintAmount);
    console.log("✅ Minted", ethers.formatUnits(mintAmount, 6), "USDC to deployer");

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    console.log("📄 Mock USDC Token:", await mockToken.getAddress());
    console.log("🏦 Mock cUSDC Token:", await mockCToken.getAddress());
    console.log("🏛️ YieldVault:", await vault.getAddress());
    console.log("📈 CompoundStrategy:", await compoundStrategy.getAddress());
    console.log("=".repeat(60));

    console.log("\n📋 Next Steps:");
    console.log("1. Approve vault to spend your USDC:");
    console.log(`   mockToken.approve("${await vault.getAddress()}", amount)`);
    console.log("2. Deposit USDC to vault:");
    console.log(`   vault.deposit(amount, "${deployer.address}")`);
    console.log("3. Rebalance to move funds to strategy:");
    console.log("   vault.rebalance()");

    // Save deployment addresses to file
    const deploymentInfo = {
        network: "localhost",
        deployer: deployer.address,
        contracts: {
            mockToken: await mockToken.getAddress(),
            mockCToken: await mockCToken.getAddress(),
            mockComptroller: await mockComptroller.getAddress(),
            vault: await vault.getAddress(),
            compoundStrategy: await compoundStrategy.getAddress()
        },
        timestamp: new Date().toISOString()
    };

    const fs = require('fs');
    fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
    console.log("\n💾 Deployment info saved to deployment.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
