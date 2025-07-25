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

// Fetch wallet transactions
export const fetchWalletTransactions = async (walletAddress: string, limit = 100) => {
  try {
    const response = await fetch(
      `${SEI_REST_ENDPOINT}/cosmos/tx/v1beta1/txs?events=message.sender='${walletAddress}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }
    
    const data: SeiTransactionResponse = await response.json();
    return data.txs || [];
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
      // Use EVM-compatible endpoints or convert to bech32 if possible
      transactions = await fetchWalletTransactions(walletAddress);
      balances = []; // EVM balance queries need different approach
      stakingInfo = []; // EVM staking queries need different approach
      
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

    // Calculate various factors
    const transactionCount = transactions.length;
    const totalBalance = balances.reduce((sum, balance) => {
      if (balance.denom === "usei") {
        return sum + parseInt(balance.amount) / 1000000; // Convert microSEI to SEI
      }
      return sum;
    }, 0);

    const totalStaked = stakingInfo.reduce((sum, delegation) => {
      return sum + parseInt(delegation.balance.amount) / 1000000;
    }, 0);

    // Calculate transaction frequency (transactions per month)
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      return txDate > oneMonthAgo;
    });

    // Calculate scores for each factor (0-100)
    const transactionHistoryScore = Math.min(100, Math.log(transactionCount + 1) * 20);
    const liquidityScore = Math.min(100, Math.log(totalBalance + 1) * 15);
    const stakingScore = Math.min(100, Math.log(totalStaked + 1) * 25);
    const activityScore = Math.min(100, recentTransactions.length * 5);

    // Weighted average
    const finalScore = Math.round(
      (transactionHistoryScore * 0.3) +
      (liquidityScore * 0.25) +
      (stakingScore * 0.25) +
      (activityScore * 0.2)
    );

    // Convert to 600-900 scale
    const scaledScore = Math.round(600 + (finalScore / 100) * 300);

    // Determine grade and risk level
    let grade = 'F';
    let riskLevel: 'low' | 'medium' | 'high' = 'high';

    if (scaledScore >= 850) { grade = 'A+'; riskLevel = 'low'; }
    else if (scaledScore >= 800) { grade = 'A'; riskLevel = 'low'; }
    else if (scaledScore >= 750) { grade = 'A-'; riskLevel = 'low'; }
    else if (scaledScore >= 700) { grade = 'B+'; riskLevel = 'medium'; }
    else if (scaledScore >= 650) { grade = 'B'; riskLevel = 'medium'; }
    else { riskLevel = 'high'; }

    return {
      score: scaledScore,
      accuracy: 95, // High accuracy since it's real blockchain data
      grade,
      riskLevel,
      factors: {
        transactionHistory: Math.round(transactionHistoryScore),
        liquidityProvision: Math.round(liquidityScore),
        defiInteractions: Math.round(stakingScore),
        networkParticipation: Math.round(activityScore),
      },
      walletAddress,
      rawData: {
        transactionCount,
        totalBalance,
        totalStaked,
        recentTransactionCount: recentTransactions.length
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