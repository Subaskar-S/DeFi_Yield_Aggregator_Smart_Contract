import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const WalletConnection = ({ account, onConnect, onDisconnect }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if wallet is already connected
    checkConnection();
    
    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (err) {
        console.error('Error checking connection:', err);
      }
    }
  };

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      onDisconnect();
    } else {
      connectWallet();
    }
  };

  const handleChainChanged = () => {
    // Reload the page when chain changes
    window.location.reload();
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install MetaMask to continue.');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Create provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const account = accounts[0];

      // Check network
      const network = await provider.getNetwork();
      console.log('Connected to network:', network.name, network.chainId);

      // For development, we might want to switch to localhost
      if (network.chainId !== 31337 && network.chainId !== 1) {
        console.warn('Not connected to expected network');
      }

      onConnect(account, provider, signer);
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    onDisconnect();
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (account) {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Wallet Connected</h3>
            <p style={{ margin: 0, opacity: 0.8 }}>
              {formatAddress(account)}
            </p>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={disconnectWallet}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Connect Your Wallet</h3>
      <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
        Connect your wallet to start earning yield on your assets
      </p>
      
      {error && (
        <div style={{ 
          background: 'rgba(255, 107, 107, 0.2)', 
          border: '1px solid rgba(255, 107, 107, 0.5)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      <button 
        className="btn" 
        onClick={connectWallet}
        disabled={isConnecting}
        style={{ minWidth: '200px' }}
      >
        {isConnecting ? (
          <>
            <span className="loading" style={{ marginRight: '0.5rem' }}></span>
            Connecting...
          </>
        ) : (
          '🦊 Connect MetaMask'
        )}
      </button>

      {!window.ethereum && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
            Don't have MetaMask?{' '}
            <a 
              href="https://metamask.io/download.html" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#4ecdc4' }}
            >
              Install it here
            </a>
          </p>
        </div>
      )}
    </div>
  );
};

export default WalletConnection;
