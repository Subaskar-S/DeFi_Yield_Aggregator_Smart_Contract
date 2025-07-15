import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const STRATEGY_ABI = [
  "function name() view returns (string)",
  "function totalAssets() view returns (uint256)",
  "function currentAPY() view returns (uint256)",
  "function isActive() view returns (bool)"
];

const StrategyOverview = ({ vaultContract, loading }) => {
  const [strategies, setStrategies] = useState([]);
  const [strategyData, setStrategyData] = useState({});
  const [loadingStrategies, setLoadingStrategies] = useState(false);

  useEffect(() => {
    if (vaultContract) {
      loadStrategies();
    }
  }, [vaultContract]);

  const loadStrategies = async () => {
    try {
      setLoadingStrategies(true);
      
      const strategyAddresses = await vaultContract.getStrategies();
      setStrategies(strategyAddresses);
      
      // Load data for each strategy
      const strategyDataPromises = strategyAddresses.map(async (address) => {
        try {
          const strategyContract = new ethers.Contract(address, STRATEGY_ABI, vaultContract.provider);
          const allocation = await vaultContract.getAllocation(address);
          
          const [name, totalAssets, currentAPY, isActive] = await Promise.all([
            strategyContract.name(),
            strategyContract.totalAssets(),
            strategyContract.currentAPY(),
            strategyContract.isActive()
          ]);

          return {
            address,
            name,
            totalAssets: ethers.utils.formatEther(totalAssets),
            currentAPY: (currentAPY.toNumber() / 100).toFixed(2), // Convert from basis points
            allocation: (allocation.toNumber() / 100).toFixed(1), // Convert from basis points to percentage
            isActive
          };
        } catch (err) {
          console.error(`Error loading strategy ${address}:`, err);
          return {
            address,
            name: 'Unknown Strategy',
            totalAssets: '0',
            currentAPY: '0',
            allocation: '0',
            isActive: false,
            error: true
          };
        }
      });

      const strategyDataResults = await Promise.all(strategyDataPromises);
      const strategyDataMap = {};
      strategyDataResults.forEach(data => {
        strategyDataMap[data.address] = data;
      });
      
      setStrategyData(strategyDataMap);
    } catch (err) {
      console.error('Error loading strategies:', err);
    } finally {
      setLoadingStrategies(false);
    }
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getStrategyIcon = (name) => {
    if (name.toLowerCase().includes('compound')) return '🏦';
    if (name.toLowerCase().includes('aave')) return '👻';
    if (name.toLowerCase().includes('uniswap')) return '🦄';
    return '📈';
  };

  const getStatusColor = (isActive) => {
    return isActive ? '#4ecdc4' : '#ff6b6b';
  };

  const getStatusText = (isActive) => {
    return isActive ? 'Active' : 'Inactive';
  };

  if (loading || loadingStrategies) {
    return (
      <div className="card">
        <h2>📊 Strategy Overview</h2>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <span className="loading"></span>
          <p style={{ marginTop: '1rem', opacity: 0.7 }}>Loading strategies...</p>
        </div>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="card">
        <h2>📊 Strategy Overview</h2>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ opacity: 0.7 }}>No strategies configured</p>
        </div>
      </div>
    );
  }

  const totalAssets = strategies.reduce((sum, address) => {
    const data = strategyData[address];
    return sum + (data ? parseFloat(data.totalAssets) : 0);
  }, 0);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>📊 Strategy Overview</h2>
        <button 
          className="btn btn-secondary" 
          onClick={loadStrategies}
          disabled={loadingStrategies}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          {loadingStrategies ? <span className="loading"></span> : '🔄 Refresh'}
        </button>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div className="stat-item">
          <div className="stat-value">
            {strategies.length}
          </div>
          <div className="stat-label">Active Strategies</div>
        </div>
      </div>

      <ul className="strategy-list">
        {strategies.map((address) => {
          const data = strategyData[address];
          
          if (!data) {
            return (
              <li key={address} className="strategy-item">
                <div>
                  <div className="strategy-name">Loading...</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                    {formatAddress(address)}
                  </div>
                </div>
                <span className="loading"></span>
              </li>
            );
          }

          return (
            <li key={address} className="strategy-item">
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ marginRight: '0.5rem', fontSize: '1.2rem' }}>
                    {getStrategyIcon(data.name)}
                  </span>
                  <div className="strategy-name">{data.name}</div>
                  <div 
                    style={{ 
                      marginLeft: '0.5rem',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      background: `${getStatusColor(data.isActive)}20`,
                      color: getStatusColor(data.isActive),
                      border: `1px solid ${getStatusColor(data.isActive)}40`
                    }}
                  >
                    {getStatusText(data.isActive)}
                  </div>
                </div>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '1rem',
                  fontSize: '0.8rem',
                  opacity: 0.8
                }}>
                  <div>
                    <strong>Assets:</strong> {parseFloat(data.totalAssets).toLocaleString(undefined, { maximumFractionDigits: 2 })} DAI
                  </div>
                  <div>
                    <strong>APY:</strong> {data.currentAPY}%
                  </div>
                  <div>
                    <strong>Allocation:</strong> {data.allocation}%
                  </div>
                </div>
                
                <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: '0.25rem' }}>
                  {formatAddress(address)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {totalAssets > 0 && (
        <div style={{ 
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px'
        }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>Asset Distribution</h4>
          {strategies.map((address) => {
            const data = strategyData[address];
            if (!data || parseFloat(data.totalAssets) === 0) return null;
            
            const percentage = (parseFloat(data.totalAssets) / totalAssets) * 100;
            
            return (
              <div key={address} style={{ marginBottom: '0.5rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  fontSize: '0.8rem',
                  marginBottom: '0.25rem'
                }}>
                  <span>{getStrategyIcon(data.name)} {data.name}</span>
                  <span>{percentage.toFixed(1)}%</span>
                </div>
                <div style={{ 
                  width: '100%', 
                  height: '4px', 
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    width: `${percentage}%`, 
                    height: '100%', 
                    background: 'linear-gradient(45deg, #4ecdc4, #44a08d)',
                    borderRadius: '2px'
                  }}></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StrategyOverview;
