import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import WalletConnection from './components/WalletConnection';
import VaultDashboard from './components/VaultDashboard';
import DepositWithdraw from './components/DepositWithdraw';
import StrategyOverview from './components/StrategyOverview';
import './App.css';

// Contract ABIs (simplified for demo)
const VAULT_ABI = [
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToShares(uint256) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function deposit(uint256, address) returns (uint256)",
  "function withdraw(uint256, address, address) returns (uint256)",
  "function redeem(uint256, address, address) returns (uint256)",
  "function currentAPY() view returns (uint256)",
  "function getStrategies() view returns (address[])",
  "function getAllocation(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contracts, setContracts] = useState({});
  const [vaultData, setVaultData] = useState({
    totalAssets: '0',
    totalSupply: '0',
    userBalance: '0',
    userShares: '0',
    currentAPY: '0',
    isPaused: false
  });
  const [tokenData, setTokenData] = useState({
    balance: '0',
    allowance: '0',
    symbol: 'DAI',
    decimals: 18
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Contract addresses (these would come from deployment)
  const CONTRACT_ADDRESSES = {
    VAULT: process.env.REACT_APP_VAULT_ADDRESS || '0x...',
    DAI: process.env.REACT_APP_DAI_ADDRESS || '0x...',
  };

  useEffect(() => {
    if (account && provider) {
      initializeContracts();
    }
  }, [account, provider]);

  useEffect(() => {
    if (contracts.vault && contracts.dai && account) {
      loadVaultData();
      loadTokenData();
    }
  }, [contracts, account]);

  const initializeContracts = async () => {
    try {
      const vaultContract = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, VAULT_ABI, signer);
      const daiContract = new ethers.Contract(CONTRACT_ADDRESSES.DAI, ERC20_ABI, signer);
      
      setContracts({
        vault: vaultContract,
        dai: daiContract
      });
    } catch (err) {
      setError('Failed to initialize contracts: ' + err.message);
    }
  };

  const loadVaultData = async () => {
    try {
      setLoading(true);
      const [totalAssets, totalSupply, userShares, currentAPY, isPaused] = await Promise.all([
        contracts.vault.totalAssets(),
        contracts.vault.totalSupply(),
        contracts.vault.balanceOf(account),
        contracts.vault.currentAPY(),
        contracts.vault.paused()
      ]);

      const userBalance = totalSupply.gt(0) 
        ? await contracts.vault.convertToAssets(userShares)
        : ethers.BigNumber.from(0);

      setVaultData({
        totalAssets: ethers.utils.formatEther(totalAssets),
        totalSupply: ethers.utils.formatEther(totalSupply),
        userBalance: ethers.utils.formatEther(userBalance),
        userShares: ethers.utils.formatEther(userShares),
        currentAPY: (currentAPY.toNumber() / 100).toFixed(2), // Convert from basis points
        isPaused
      });
    } catch (err) {
      setError('Failed to load vault data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTokenData = async () => {
    try {
      const [balance, allowance, symbol, decimals] = await Promise.all([
        contracts.dai.balanceOf(account),
        contracts.dai.allowance(account, CONTRACT_ADDRESSES.VAULT),
        contracts.dai.symbol(),
        contracts.dai.decimals()
      ]);

      setTokenData({
        balance: ethers.utils.formatUnits(balance, decimals),
        allowance: ethers.utils.formatUnits(allowance, decimals),
        symbol,
        decimals
      });
    } catch (err) {
      setError('Failed to load token data: ' + err.message);
    }
  };

  const handleWalletConnect = (account, provider, signer) => {
    setAccount(account);
    setProvider(provider);
    setSigner(signer);
    setError('');
  };

  const handleWalletDisconnect = () => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setContracts({});
    setVaultData({
      totalAssets: '0',
      totalSupply: '0',
      userBalance: '0',
      userShares: '0',
      currentAPY: '0',
      isPaused: false
    });
    setTokenData({
      balance: '0',
      allowance: '0',
      symbol: 'DAI',
      decimals: 18
    });
  };

  const refreshData = () => {
    if (contracts.vault && contracts.dai && account) {
      loadVaultData();
      loadTokenData();
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 DeFi Yield Aggregator</h1>
        <p>Maximize your yields across multiple DeFi protocols</p>
      </header>

      <main className="App-main">
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        <WalletConnection
          account={account}
          onConnect={handleWalletConnect}
          onDisconnect={handleWalletDisconnect}
        />

        {account && (
          <>
            <VaultDashboard
              vaultData={vaultData}
              tokenData={tokenData}
              loading={loading}
              onRefresh={refreshData}
            />

            <div className="main-content">
              <DepositWithdraw
                contracts={contracts}
                account={account}
                vaultData={vaultData}
                tokenData={tokenData}
                onTransactionComplete={refreshData}
              />

              <StrategyOverview
                vaultContract={contracts.vault}
                loading={loading}
              />
            </div>
          </>
        )}
      </main>

      <footer className="App-footer">
        <p>Built with ❤️ for DeFi enthusiasts</p>
      </footer>
    </div>
  );
}

export default App;
