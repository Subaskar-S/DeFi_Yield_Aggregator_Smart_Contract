import React from 'react';

const VaultDashboard = ({ vaultData, tokenData, loading, onRefresh }) => {
  const formatNumber = (value, decimals = 2) => {
    const num = parseFloat(value);
    if (num === 0) return '0';
    if (num < 0.01) return '< 0.01';
    return num.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  const formatCurrency = (value) => {
    return `$${formatNumber(value)}`;
  };

  const formatPercentage = (value) => {
    return `${formatNumber(value)}%`;
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>📊 Vault Overview</h2>
        <button 
          className="btn btn-secondary" 
          onClick={onRefresh}
          disabled={loading}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          {loading ? <span className="loading"></span> : '🔄 Refresh'}
        </button>
      </div>

      {vaultData.isPaused && (
        <div style={{
          background: 'rgba(255, 193, 7, 0.2)',
          border: '1px solid rgba(255, 193, 7, 0.5)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          ⚠️ <strong>Vault is Paused</strong> - Only emergency withdrawals are allowed
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">
            {formatPercentage(vaultData.currentAPY)}
          </div>
          <div className="stat-label">Current APY</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">
            {formatNumber(vaultData.totalAssets)} {tokenData.symbol}
          </div>
          <div className="stat-label">Total Assets</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">
            {formatNumber(vaultData.userBalance)} {tokenData.symbol}
          </div>
          <div className="stat-label">Your Balance</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">
            {formatNumber(vaultData.userShares)}
          </div>
          <div className="stat-label">Your Shares</div>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '1rem',
        marginTop: '1rem'
      }}>
        <div className="stat-item">
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>
            {formatNumber(tokenData.balance)} {tokenData.symbol}
          </div>
          <div className="stat-label">Wallet Balance</div>
        </div>

        <div className="stat-item">
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>
            {formatNumber(tokenData.allowance)} {tokenData.symbol}
          </div>
          <div className="stat-label">Approved Amount</div>
        </div>
      </div>

      {parseFloat(vaultData.userBalance) > 0 && (
        <div style={{ 
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(78, 205, 196, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(78, 205, 196, 0.3)'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#4ecdc4' }}>
            💰 Your Position
          </h4>
          <p style={{ margin: 0, opacity: 0.9 }}>
            You have {formatNumber(vaultData.userShares)} shares representing{' '}
            {formatNumber(vaultData.userBalance)} {tokenData.symbol} in the vault.
          </p>
          {parseFloat(vaultData.currentAPY) > 0 && (
            <p style={{ margin: '0.5rem 0 0 0', opacity: 0.8, fontSize: '0.9rem' }}>
              Earning {formatPercentage(vaultData.currentAPY)} APY across multiple strategies.
            </p>
          )}
        </div>
      )}

      {parseFloat(vaultData.userBalance) === 0 && parseFloat(tokenData.balance) > 0 && (
        <div style={{ 
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(102, 126, 234, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          textAlign: 'center'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#667eea' }}>
            🚀 Ready to Start Earning?
          </h4>
          <p style={{ margin: 0, opacity: 0.9 }}>
            You have {formatNumber(tokenData.balance)} {tokenData.symbol} in your wallet.
            Deposit to start earning {formatPercentage(vaultData.currentAPY)} APY!
          </p>
        </div>
      )}

      {parseFloat(tokenData.balance) === 0 && parseFloat(vaultData.userBalance) === 0 && (
        <div style={{ 
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>
            💡 Get Started
          </h4>
          <p style={{ margin: 0, opacity: 0.8 }}>
            You need {tokenData.symbol} tokens to deposit into the vault.
            Get some {tokenData.symbol} from an exchange or DEX to start earning yield!
          </p>
        </div>
      )}
    </div>
  );
};

export default VaultDashboard;
