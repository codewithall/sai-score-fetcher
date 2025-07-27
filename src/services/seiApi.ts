// SEI Network API integration
const SEI_RPC_ENDPOINT = "https://rpc.sei-apis.com"; // Main SEI RPC
const SEI_REST_ENDPOINT = "https://rest.sei-apis.com"; // SEI REST API
const SEI_EVM_RPC = "https://evm-rpc.sei-apis.com"; // SEI EVM RPC for 0x addresses

// Validate SEI network address format (Bech32 or EVM)
const isValidSeiAddress = (address: string): boolean => {
  // Bech32 address (sei...)
  const bech32Regex = /^sei[a-z0-9]{39,59}$/;
  // EVM address (0x...)
  const evmRegex = /^0x[a-fA-F0-9]{40}$/;
  
  return bech32Regex.test(address) || evmRegex.test(address);
};

interface SeiTransactionResponse {
  txs: {
    txhash: string;
    height: string;
    timestamp: string;
    tx: {
      body: {
        messages: any[];
      };
    };
    logs: any[];
  }[];
  pagination: {
    total: string;
  };
}

interface SeiBalanceResponse {
  balances: {
    denom: string;
    amount: string;
  }[];
}

interface SeiValidatorResponse {
  delegation_responses: {
    delegation: {
      delegator_address: string;
      validator_address: string;
      shares: string;
    };
    balance: {
      denom: string;
      amount: string;
    };
  }[];
}

// Fetch wallet transactions with multiple query methods
export const fetchWalletTransactions = async (walletAddress: string, limit = 100) => {
  try {
    console.log(`Fetching transactions for address: ${walletAddress}`);
    
    // Try multiple query formats to get transactions
    const queries = [
      `message.sender='${walletAddress}'`,
      `transfer.recipient='${walletAddress}'`,
      `transfer.sender='${walletAddress}'`,
      `coin_received.receiver='${walletAddress}'`,
      `coin_spent.spender='${walletAddress}'`
    ];
    
    let allTransactions: any[] = [];
    
    for (const query of queries) {
      try {
        const response = await fetch(
          `${SEI_REST_ENDPOINT}/cosmos/tx/v1beta1/txs?events=${encodeURIComponent(query)}&pagination.limit=${limit}&order_by=ORDER_BY_DESC`
        );
        
        if (response.ok) {
          const data: SeiTransactionResponse = await response.json();
          console.log(`Query "${query}" returned ${data.txs?.length || 0} transactions`);
          
          if (data.txs && data.txs.length > 0) {
            // Merge transactions, avoiding duplicates
            const newTxs = data.txs.filter(tx => 
              !allTransactions.some(existing => existing.txhash === tx.txhash)
            );
            allTransactions = [...allTransactions, ...newTxs];
          }
        }
      } catch (queryError) {
        console.warn(`Query "${query}" failed:`, queryError);
      }
    }
    
    // Sort by height (newest first)
    allTransactions.sort((a, b) => parseInt(b.height) - parseInt(a.height));
    
    console.log(`Total unique transactions found: ${allTransactions.length}`);
    return allTransactions.slice(0, limit);
    
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
};

// Fetch EVM wallet balance
export const fetchEvmBalance = async (walletAddress: string) => {
  try {
    const response = await fetch(SEI_EVM_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch EVM balance: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(`EVM RPC error: ${data.error.message}`);
    }
    
    // Convert from wei to SEI (divide by 10^18)
    const balanceWei = parseInt(data.result, 16);
    return balanceWei / Math.pow(10, 18);
  } catch (error) {
    console.error("Error fetching EVM balance:", error);
    return 0;
  }
};

// Fetch wallet balance
export const fetchWalletBalance = async (walletAddress: string) => {
  try {
    const response = await fetch(
      `${SEI_REST_ENDPOINT}/cosmos/bank/v1beta1/balances/${walletAddress}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch balance: ${response.status}`);
    }
    
    const data: SeiBalanceResponse = await response.json();
    return data.balances || [];
  } catch (error) {
    console.error("Error fetching balance:", error);
    return [];
  }
};

// Fetch staking information
export const fetchStakingInfo = async (walletAddress: string) => {
  try {
    const response = await fetch(
      `${SEI_REST_ENDPOINT}/cosmos/staking/v1beta1/delegations/${walletAddress}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch staking info: ${response.status}`);
    }
    
    const data: SeiValidatorResponse = await response.json();
    return data.delegation_responses || [];
  } catch (error) {
    console.error("Error fetching staking info:", error);
    return [];
  }
};

// Calculate credit score from real blockchain data
export const calculateCreditScore = async (walletAddress: string) => {
  // Validate address format first
  if (!isValidSeiAddress(walletAddress)) {
    throw new Error("Invalid address format. Please use a valid Bech32 address (sei...) or EVM address (0x...)");
  }

  try {
    // Check if it's an EVM address and handle differently
    const isEvmAddress = walletAddress.startsWith('0x');
    
    let transactions, balances, stakingInfo;
    
    if (isEvmAddress) {
      // For EVM addresses, we can only get limited data
      transactions = await fetchWalletTransactions(walletAddress);
      balances = [];
      stakingInfo = [];
      
      // Try to get EVM balance using different method
      try {
        const evmBalance = await fetchEvmBalance(walletAddress);
        if (evmBalance > 0) {
          balances = [{ denom: "usei", amount: (evmBalance * 1000000).toString() }];
        }
      } catch (error) {
        console.warn("Could not fetch EVM balance:", error);
      }
    } else {
      // For Bech32 addresses, use the standard Cosmos API
      [transactions, balances, stakingInfo] = await Promise.all([
        fetchWalletTransactions(walletAddress),
        fetchWalletBalance(walletAddress),
        fetchStakingInfo(walletAddress)
      ]);
    }

    // Enhanced scoring algorithm for SEI Network
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // 1. TRANSACTION HISTORY ANALYSIS (35% weight)
    const transactionCount = transactions.length;
    const recentTransactions = transactions.filter(tx => new Date(tx.timestamp) > oneMonthAgo);
    const mediumTermTxs = transactions.filter(tx => new Date(tx.timestamp) > threeMonthsAgo);
    const longTermTxs = transactions.filter(tx => new Date(tx.timestamp) > sixMonthsAgo);

    // Calculate transaction consistency and frequency
    const consistencyScore = Math.min(100, (
      (recentTransactions.length * 0.5) + 
      (mediumTermTxs.length * 0.3) + 
      (longTermTxs.length * 0.2)
    ) * 2);

    // Analyze transaction complexity (DeFi interactions)
    const defiTransactions = transactions.filter(tx => {
      const messages = tx.tx?.body?.messages || [];
      return messages.some(msg => 
        msg['@type']?.includes('wasm') || 
        msg['@type']?.includes('swap') ||
        msg['@type']?.includes('pool') ||
        msg['@type']?.includes('liquidity')
      );
    });

    const transactionHistoryScore = Math.min(100, 
      (Math.log(transactionCount + 1) * 15) + 
      (consistencyScore * 0.4) + 
      (defiTransactions.length * 3)
    );

    // 2. NETWORK PARTICIPATION (25% weight)
    const totalStaked = stakingInfo.reduce((sum, delegation) => {
      return sum + parseInt(delegation.balance.amount) / 1000000;
    }, 0);

    const totalBalance = balances.reduce((sum, balance) => {
      if (balance.denom === "usei") {
        return sum + parseInt(balance.amount) / 1000000;
      }
      return sum;
    }, 0);

    // Calculate staking ratio (staked / total holdings)
    const stakingRatio = totalBalance > 0 ? (totalStaked / (totalStaked + totalBalance)) : 0;
    const validatorDiversity = stakingInfo.length; // Number of different validators

    const networkParticipationScore = Math.min(100, 
      (Math.log(totalStaked + 1) * 20) + 
      (stakingRatio * 40) + 
      (validatorDiversity * 8)
    );

    // 3. LIQUIDITY PROVISION (25% weight)
    const liquidityBalance = totalBalance;
    const balanceStability = Math.min(100, Math.log(liquidityBalance + 1) * 18);
    
    // Consider multi-token holdings as liquidity diversification
    const tokenDiversity = balances.length;
    const diversificationBonus = Math.min(20, tokenDiversity * 5);

    const liquidityProvisionScore = Math.min(100, balanceStability + diversificationBonus);

    // 4. DEFI INTERACTIONS (15% weight)
    const defiScore = Math.min(100, 
      (defiTransactions.length * 8) + 
      (Math.log(defiTransactions.length + 1) * 15)
    );

    // Enhanced weighted calculation
    const finalScore = Math.round(
      (transactionHistoryScore * 0.35) +
      (networkParticipationScore * 0.25) +
      (liquidityProvisionScore * 0.25) +
      (defiScore * 0.15)
    );

    // Convert to 600-900 scale with better distribution
    const scaledScore = Math.round(600 + (finalScore / 100) * 300);

    // More nuanced grade and risk assessment
    let grade = 'F';
    let riskLevel: 'low' | 'medium' | 'high' = 'high';

    if (scaledScore >= 850) { grade = 'A+'; riskLevel = 'low'; }
    else if (scaledScore >= 800) { grade = 'A'; riskLevel = 'low'; }
    else if (scaledScore >= 750) { grade = 'A-'; riskLevel = 'low'; }
    else if (scaledScore >= 700) { grade = 'B+'; riskLevel = 'medium'; }
    else if (scaledScore >= 650) { grade = 'B'; riskLevel = 'medium'; }
    else if (scaledScore >= 600) { grade = 'C'; riskLevel = 'medium'; }
    else { grade = 'D'; riskLevel = 'high'; }

    // Calculate accuracy based on data availability
    let accuracy = 85; // Base accuracy
    if (!isEvmAddress && transactionCount > 10) accuracy += 5;
    if (stakingInfo.length > 0) accuracy += 5;
    if (balances.length > 1) accuracy += 3;
    if (defiTransactions.length > 0) accuracy += 2;

    return {
      score: scaledScore,
      accuracy: Math.min(99, accuracy),
      grade,
      riskLevel,
      factors: {
        transactionHistory: Math.round(transactionHistoryScore),
        liquidityProvision: Math.round(liquidityProvisionScore),
        defiInteractions: Math.round(defiScore),
        networkParticipation: Math.round(networkParticipationScore),
      },
      walletAddress,
      rawData: {
        transactionCount,
        totalBalance,
        totalStaked,
        recentTransactionCount: recentTransactions.length,
        defiTransactionCount: defiTransactions.length,
        stakingRatio: Math.round(stakingRatio * 100),
        validatorCount: validatorDiversity
      }
    };

  } catch (error) {
    console.error("Error calculating credit score:", error);
    throw new Error("Failed to calculate credit score from blockchain data");
  }
};

// Generate comparison data (mock for now - could be enhanced with a backend)
export const generateComparisonData = (userScore: number) => {
  // Mock network statistics - in a real app, this would come from your backend
  const totalUsers = 45000 + Math.floor(Math.random() * 5000);
  const averageScore = 720 + Math.floor(Math.random() * 40);
  
  // Calculate percentile based on score
  let percentile;
  if (userScore >= 850) percentile = 95 + Math.floor(Math.random() * 5);
  else if (userScore >= 800) percentile = 85 + Math.floor(Math.random() * 10);
  else if (userScore >= 750) percentile = 70 + Math.floor(Math.random() * 15);
  else if (userScore >= 700) percentile = 50 + Math.floor(Math.random() * 20);
  else if (userScore >= 650) percentile = 25 + Math.floor(Math.random() * 25);
  else percentile = Math.floor(Math.random() * 25);

  const rank = Math.floor(totalUsers * (100 - percentile) / 100);

  return {
    userScore,
    percentile,
    averageScore,
    totalUsers,
    rank,
    scoreDistribution: [
      { range: "850-900", percentage: 8, count: Math.floor(totalUsers * 0.08) },
      { range: "800-849", percentage: 15, count: Math.floor(totalUsers * 0.15) },
      { range: "750-799", percentage: 22, count: Math.floor(totalUsers * 0.22) },
      { range: "700-749", percentage: 25, count: Math.floor(totalUsers * 0.25) },
      { range: "650-699", percentage: 18, count: Math.floor(totalUsers * 0.18) },
      { range: "600-649", percentage: 12, count: Math.floor(totalUsers * 0.12) },
    ]
  };
};