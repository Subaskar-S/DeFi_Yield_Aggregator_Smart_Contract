import React, { useState } from 'react';
import { ethers } from 'ethers';

const DepositWithdraw = ({ contracts, account, vaultData, tokenData, onTransactionComplete }) => {
  const [activeTab, setActiveTab] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setAmount('');
    setError('');
    setTxHash('');
  };

  const handleMaxClick = () => {
    if (activeTab === 'deposit') {
      setAmount(tokenData.balance);
    } else {
      setAmount(vaultData.userBalance);
    }
  };

  const validateAmount = () => {
    if (!amount || parseFloat(amount) <= 0) {
      throw new Error('Please enter a valid amount');
    }

    if (activeTab === 'deposit') {
      if (parseFloat(amount) > parseFloat(tokenData.balance)) {
        throw new Error('Insufficient balance');
      }
    } else {
      if (parseFloat(amount) > parseFloat(vaultData.userBalance)) {
        throw new Error('Insufficient vault balance');
      }
    }
  };

  const handleApprove = async () => {
    try {
      setIsLoading(true);
      setError('');
      setTxHash('');

      validateAmount();

      const amountWei = ethers.utils.parseUnits(amount, tokenData.decimals);
      const tx = await contracts.dai.approve(contracts.vault.address, amountWei);
      
      setTxHash(tx.hash);
      await tx.wait();
      
      onTransactionComplete();
    } catch (err) {
      setError(err.message || 'Approval failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    try {
      setIsLoading(true);
      setError('');
      setTxHash('');

      validateAmount();

      const amountWei = ethers.utils.parseUnits(amount, tokenData.decimals);
      
      // Check allowance
      const allowance = await contracts.dai.allowance(account, contracts.vault.address);
      if (allowance.lt(amountWei)) {
        throw new Error('Insufficient allowance. Please approve first.');
      }

      const tx = await contracts.vault.deposit(amountWei, account);
      
      setTxHash(tx.hash);
      await tx.wait();
      
      setAmount('');
      onTransactionComplete();
    } catch (err) {
      setError(err.message || 'Deposit failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setIsLoading(true);
      setError('');
      setTxHash('');

      validateAmount();

      const amountWei = ethers.utils.parseUnits(amount, tokenData.decimals);
      const tx = await contracts.vault.withdraw(amountWei, account, account);
      
      setTxHash(tx.hash);
      await tx.wait();
      
      setAmount('');
      onTransactionComplete();
    } catch (err) {
      setError(err.message || 'Withdrawal failed');
    } finally {
      setIsLoading(false);
    }
  };

  const needsApproval = () => {
    if (activeTab !== 'deposit' || !amount) return false;
    try {
      const amountWei = ethers.utils.parseUnits(amount, tokenData.decimals);
      const allowanceWei = ethers.utils.parseUnits(tokenData.allowance, tokenData.decimals);
      return allowanceWei.lt(amountWei);
    } catch {
      return false;
    }
  };

  const canDeposit = () => {
    return activeTab === 'deposit' && 
           amount && 
           parseFloat(amount) > 0 && 
           parseFloat(amount) <= parseFloat(tokenData.balance) &&
           !needsApproval() &&
           !vaultData.isPaused;
  };

  const canWithdraw = () => {
    return activeTab === 'withdraw' && 
           amount && 
           parseFloat(amount) > 0 && 
           parseFloat(amount) <= parseFloat(vaultData.userBalance);
  };

  return (
    <div className="card">
      <h2>💰 Deposit & Withdraw</h2>
      
      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        marginBottom: '1.5rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        padding: '0.25rem'
      }}>
        <button
          className={`btn ${activeTab === 'deposit' ? '' : 'btn-secondary'}`}
          onClick={() => handleTabChange('deposit')}
          style={{ 
            flex: 1, 
            margin: '0 0.25rem',
            padding: '0.5rem'
          }}
        >
          Deposit
        </button>
        <button
          className={`btn ${activeTab === 'withdraw' ? '' : 'btn-secondary'}`}
          onClick={() => handleTabChange('withdraw')}
          style={{ 
            flex: 1, 
            margin: '0 0.25rem',
            padding: '0.5rem'
          }}
        >
          Withdraw
        </button>
      </div>

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

      {txHash && (
        <div style={{
          background: 'rgba(78, 205, 196, 0.2)',
          border: '1px solid rgba(78, 205, 196, 0.5)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          Transaction submitted: {' '}
          <a 
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ecdc4' }}
          >
            {txHash.slice(0, 10)}...
          </a>
        </div>
      )}

      <div className="input-group">
        <label>
          Amount ({tokenData.symbol})
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Enter ${tokenData.symbol} amount`}
            disabled={isLoading}
            step="0.01"
            min="0"
          />
          <button
            onClick={handleMaxClick}
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(102, 126, 234, 0.3)',
              border: '1px solid rgba(102, 126, 234, 0.5)',
              borderRadius: '4px',
              color: 'white',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
            disabled={isLoading}
          >
            MAX
          </button>
        </div>
        <div style={{ 
          fontSize: '0.8rem', 
          opacity: 0.7, 
          marginTop: '0.25rem',
          textAlign: 'right'
        }}>
          Available: {activeTab === 'deposit' ? tokenData.balance : vaultData.userBalance} {tokenData.symbol}
        </div>
      </div>

      {activeTab === 'deposit' && (
        <div style={{ marginBottom: '1rem' }}>
          {needsApproval() ? (
            <button
              className="btn btn-success"
              onClick={handleApprove}
              disabled={isLoading || !amount || parseFloat(amount) <= 0}
              style={{ width: '100%', marginBottom: '0.5rem' }}
            >
              {isLoading ? (
                <>
                  <span className="loading" style={{ marginRight: '0.5rem' }}></span>
                  Approving...
                </>
              ) : (
                `Approve ${tokenData.symbol}`
              )}
            </button>
          ) : (
            <button
              className="btn"
              onClick={handleDeposit}
              disabled={!canDeposit() || isLoading}
              style={{ width: '100%', marginBottom: '0.5rem' }}
            >
              {isLoading ? (
                <>
                  <span className="loading" style={{ marginRight: '0.5rem' }}></span>
                  Depositing...
                </>
              ) : (
                'Deposit'
              )}
            </button>
          )}
          
          {vaultData.isPaused && (
            <p style={{ 
              fontSize: '0.8rem', 
              opacity: 0.7, 
              textAlign: 'center',
              color: '#ff6b6b'
            }}>
              ⚠️ Deposits are paused
            </p>
          )}
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            className="btn btn-danger"
            onClick={handleWithdraw}
            disabled={!canWithdraw() || isLoading}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          >
            {isLoading ? (
              <>
                <span className="loading" style={{ marginRight: '0.5rem' }}></span>
                Withdrawing...
              </>
            ) : (
              'Withdraw'
            )}
          </button>
        </div>
      )}

      {amount && parseFloat(amount) > 0 && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '1rem',
          fontSize: '0.9rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>Amount:</span>
            <span>{parseFloat(amount).toLocaleString()} {tokenData.symbol}</span>
          </div>
          {activeTab === 'deposit' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>You will receive:</span>
              <span>~{parseFloat(amount).toLocaleString()} shares</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DepositWithdraw;
