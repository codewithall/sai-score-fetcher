// SEI Network API integration with advanced credit scoring
const SEI_RPC_ENDPOINT = "https://rpc.sei-apis.com";
const SEI_REST_ENDPOINT = "https://rest.sei-apis.com";
const SEI_EVM_RPC = "https://evm-rpc.sei-apis.com";
const SEI_EXPLORER = "https://sei.blockscout.com/api/v2/addresses";
const MAX_BLOCK_RANGE = 2000; // SEI RPC limit

// Validate SEI network address format (Bech32 or EVM)
const isValidSeiAddress = (address: string): boolean => {
  const bech32Regex = /^sei[a-z0-9]{39,59}$/;
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

interface ExplorerTransaction {
  timestamp: string;
  block_number: number;
  hash: string;
  method?: string;
  to?: {
    hash: string;
  };
  from?: {
    hash: string;
  };
}

interface WalletCounters {
  transaction_count: number;
  unique_addresses: string[];
}

// Fetch wallet's first transaction info from explorer
const fetchFirstTransactionInfo = async (walletAddress: string): Promise<{ timestamp: Date | null; blockNumber: number | null }> => {
  try {
    const response = await fetch(`${SEI_EXPLORER}/${walletAddress}/transactions?limit=1&sort=asc`);
    if (!response.ok) return { timestamp: null, blockNumber: null };
    
    const data = await response.json();
    const items = data.items || [];
    
    if (items.length === 0) {
      return { timestamp: null, blockNumber: null };
    }
    
    const tx = items[0];
    const timestamp = new Date(tx.timestamp);
    const blockNumber = tx.block_number || tx.blockNumber;
    
    console.log(`First transaction found at block ${blockNumber}, timestamp: ${timestamp}`);
    return { timestamp, blockNumber };
  } catch (error) {
    console.error("Error fetching first transaction:", error);
    return { timestamp: null, blockNumber: null };
  }
};

// Fetch wallet counters from explorer
const fetchWalletCounters = async (walletAddress: string): Promise<WalletCounters> => {
  try {
    const response = await fetch(`${SEI_EXPLORER}/${walletAddress}/counters`);
    if (!response.ok) throw new Error(`Failed to fetch counters: ${response.status}`);
    
    const data = await response.json();
    console.log(`Wallet counters: ${data.transaction_count} transactions`);
    
    return {
      transaction_count: data.transaction_count || 0,
      unique_addresses: data.unique_addresses || []
    };
  } catch (error) {
    console.error("Error fetching wallet counters:", error);
    return { transaction_count: 0, unique_addresses: [] };
  }
};

// Enhanced wallet balance fetching
const fetchWalletBalance = async (walletAddress: string): Promise<number> => {
  try {
    // Try EVM balance first if it's an EVM address
    if (walletAddress.startsWith('0x')) {
      const evmBalance = await fetchEvmBalance(walletAddress);
      if (evmBalance > 0) return evmBalance;
    }
    
    // Fallback to Cosmos API for bech32 addresses
    const response = await fetch(`${SEI_REST_ENDPOINT}/cosmos/bank/v1beta1/balances/${walletAddress}`);
    if (!response.ok) throw new Error(`Failed to fetch balance: ${response.status}`);
    
    const data: SeiBalanceResponse = await response.json();
    const seiBalance = data.balances.find(b => b.denom === "usei");
    
    return seiBalance ? parseInt(seiBalance.amount) / 1000000 : 0;
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    return 0;
  }
};

// Fetch EVM wallet balance
const fetchEvmBalance = async (walletAddress: string): Promise<number> => {
  try {
    const response = await fetch(SEI_EVM_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1,
      }),
    });
    
    if (!response.ok) throw new Error(`Failed to fetch EVM balance: ${response.status}`);
    
    const data = await response.json();
    if (data.error) throw new Error(`EVM RPC error: ${data.error.message}`);
    
    const balanceWei = parseInt(data.result, 16);
    return balanceWei / Math.pow(10, 18);
  } catch (error) {
    console.error("Error fetching EVM balance:", error);
    return 0;
  }
};

// Fetch staking information
const fetchStakingInfo = async (walletAddress: string) => {
  try {
    const response = await fetch(`${SEI_REST_ENDPOINT}/cosmos/staking/v1beta1/delegations/${walletAddress}`);
    if (!response.ok) throw new Error(`Failed to fetch staking info: ${response.status}`);
    
    const data: SeiValidatorResponse = await response.json();
    return data.delegation_responses || [];
  } catch (error) {
    console.error("Error fetching staking info:", error);
    return [];
  }
};

// Enhanced transaction fetching with multiple query methods
const fetchWalletTransactions = async (walletAddress: string, limit = 100) => {
  try {
    console.log(`Fetching transactions for address: ${walletAddress}`);
    
    // Try explorer API first for better data
    try {
      const response = await fetch(`${SEI_EXPLORER}/${walletAddress}/transactions?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        const transactions = data.items || [];
        console.log(`Explorer API returned ${transactions.length} transactions`);
        if (transactions.length > 0) {
          return transactions.map((tx: ExplorerTransaction) => ({
            txhash: tx.hash,
            height: tx.block_number.toString(),
            timestamp: tx.timestamp,
            tx: { body: { messages: [] } },
            logs: [],
            method: tx.method,
            to: tx.to?.hash,
            from: tx.from?.hash
          }));
        }
      }
    } catch (explorerError) {
      console.warn("Explorer API failed, falling back to REST API:", explorerError);
    }
    
    // Fallback to REST API with multiple query methods
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
          if (data.txs && data.txs.length > 0) {
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
    
    allTransactions.sort((a, b) => parseInt(b.height) - parseInt(a.height));
    console.log(`Total unique transactions found: ${allTransactions.length}`);
    return allTransactions.slice(0, limit);
    
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
};

// Advanced credit scoring engine based on the Python implementation
class DeFiCreditScorer {
  private static readonly BASE_SCORE = 500;
  private static readonly WEIGHTS = {
    age: 0.15,
    transactions: 0.20,
    balance: 0.25,
    repayment: 0.30,
    defi: 0.10
  };

  // Score account age (days since first transaction)
  private static scoreAge(days: number | null): number {
    if (days === null) return -50;
    if (days > 730) return 100;  // 2+ years
    if (days > 365) return 60;   // 1+ years
    if (days > 90) return 20;    // 3+ months
    return -30;                  // Very new
  }

  // Score transaction activity
  private static scoreTransactions(txCount: number): number {
    if (txCount > 2000) return 100;
    if (txCount > 300) return 60;
    if (txCount > 50) return 20;
    return -20;
  }

  // Score wallet balance
  private static scoreBalance(seiBalance: number): number {
    if (seiBalance > 5000) return 100;
    if (seiBalance > 500) return 60;
    if (seiBalance > 50) return 20;
    return -30;
  }

  // Score DeFi interactions and repayment behavior
  private static scoreRepayment(transactions: any[]): number {
    // Analyze transaction patterns for DeFi lending behavior
    const defiTxs = transactions.filter(tx => {
      const method = tx.method?.toLowerCase() || '';
      return method.includes('borrow') || 
             method.includes('repay') || 
             method.includes('liquidat') ||
             method.includes('lend');
    });

    const borrowTxs = defiTxs.filter(tx => tx.method?.toLowerCase().includes('borrow'));
    const repayTxs = defiTxs.filter(tx => tx.method?.toLowerCase().includes('repay'));
    const liquidationTxs = defiTxs.filter(tx => tx.method?.toLowerCase().includes('liquidat'));

    if (borrowTxs.length === 0) return 0; // No lending activity

    // Calculate repayment ratio
    const repaymentRatio = repayTxs.length / borrowTxs.length;
    const liquidationRatio = liquidationTxs.length / borrowTxs.length;

    if (liquidationRatio === 0 && repaymentRatio >= 0.8) return 100; // Excellent repayment
    if (liquidationRatio < 0.1 && repaymentRatio >= 0.6) return 60;  // Good repayment
    if (liquidationRatio < 0.25) return 0;                          // Average
    
    return Math.max(-150, -150 * liquidationRatio); // Poor repayment history
  }

  // Score DeFi protocol diversity
  private static scoreDeFiExtras(uniqueContracts: number): number {
    if (uniqueContracts > 25) return 30;
    if (uniqueContracts > 10) return 10;
    return 0;
  }

  // Main scoring calculation
  static async calculate(walletAddress: string) {
    console.log(`Calculating credit score for: ${walletAddress}`);
    
    // Gather all wallet data
    const [firstTxInfo, counters, balance, stakingInfo, transactions] = await Promise.all([
      fetchFirstTransactionInfo(walletAddress),
      fetchWalletCounters(walletAddress),
      fetchWalletBalance(walletAddress),
      fetchStakingInfo(walletAddress),
      fetchWalletTransactions(walletAddress, 500)
    ]);

    // Calculate account age
    const daysOld = firstTxInfo.timestamp 
      ? Math.floor((Date.now() - firstTxInfo.timestamp.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    console.log(`Account age: ${daysOld} days, Transactions: ${counters.transaction_count}, Balance: ${balance} SEI`);

    // Calculate individual scores
    const ageScore = this.scoreAge(daysOld);
    const txScore = this.scoreTransactions(counters.transaction_count);
    const balanceScore = this.scoreBalance(balance);
    const repaymentScore = this.scoreRepayment(transactions);
    const defiScore = this.scoreDeFiExtras(counters.unique_addresses.length);

    // Calculate weighted final score
    const rawScore = this.BASE_SCORE + 
      (ageScore * this.WEIGHTS.age) +
      (txScore * this.WEIGHTS.transactions) +
      (balanceScore * this.WEIGHTS.balance) +
      (repaymentScore * this.WEIGHTS.repayment) +
      (defiScore * this.WEIGHTS.defi);

    const finalScore = Math.max(0, Math.min(1000, Math.round(rawScore)));

    // Determine risk level and grade
    let riskLevel: 'low' | 'medium' | 'high';
    let grade: string;

    if (finalScore >= 850) { grade = 'A+'; riskLevel = 'low'; }
    else if (finalScore >= 800) { grade = 'A'; riskLevel = 'low'; }
    else if (finalScore >= 750) { grade = 'A-'; riskLevel = 'low'; }
    else if (finalScore >= 700) { grade = 'B+'; riskLevel = 'medium'; }
    else if (finalScore >= 650) { grade = 'B'; riskLevel = 'medium'; }
    else if (finalScore >= 500) { grade = 'C'; riskLevel = 'medium'; }
    else if (finalScore >= 300) { grade = 'D'; riskLevel = 'high'; }
    else { grade = 'F'; riskLevel = 'high'; }

    // Calculate accuracy based on data availability
    let accuracy = 75; // Base accuracy
    if (daysOld !== null) accuracy += 10;
    if (counters.transaction_count > 0) accuracy += 10;
    if (balance > 0) accuracy += 5;

    const totalStaked = stakingInfo.reduce((sum, delegation) => 
      sum + parseInt(delegation.balance.amount) / 1000000, 0
    );

    console.log(`Final score: ${finalScore}, Grade: ${grade}, Risk: ${riskLevel}`);

    return {
      score: finalScore,
      accuracy: Math.min(99, accuracy),
      grade,
      riskLevel,
      factors: {
        transactionHistory: Math.round(txScore),
        liquidityProvision: Math.round(balanceScore),
        defiInteractions: Math.round(repaymentScore),
        networkParticipation: Math.round(ageScore + defiScore),
      },
      walletAddress,
      rawData: {
        transactionCount: counters.transaction_count,
        totalBalance: balance,
        totalStaked,
        accountAgeDays: daysOld,
        defiTransactionCount: transactions.filter(tx => 
          tx.method?.toLowerCase().includes('swap') ||
          tx.method?.toLowerCase().includes('lend') ||
          tx.method?.toLowerCase().includes('borrow')
        ).length,
        uniqueContractsInteracted: counters.unique_addresses.length
      }
    };
  }
}

// Main exported function
export const calculateCreditScore = async (walletAddress: string) => {
  if (!isValidSeiAddress(walletAddress)) {
    throw new Error("Invalid address format. Please use a valid Bech32 address (sei...) or EVM address (0x...)");
  }

  try {
    return await DeFiCreditScorer.calculate(walletAddress);
  } catch (error) {
    console.error("Error calculating credit score:", error);
    throw new Error("Failed to calculate credit score from blockchain data");
  }
};

// Generate comparison data
export const generateComparisonData = (userScore: number) => {
  const totalUsers = 45000 + Math.floor(Math.random() * 5000);
  const averageScore = 520 + Math.floor(Math.random() * 40); // More realistic average
  
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
      { range: "850-1000", percentage: 8, count: Math.floor(totalUsers * 0.08) },
      { range: "800-849", percentage: 15, count: Math.floor(totalUsers * 0.15) },
      { range: "750-799", percentage: 22, count: Math.floor(totalUsers * 0.22) },
      { range: "700-749", percentage: 25, count: Math.floor(totalUsers * 0.25) },
      { range: "650-699", percentage: 18, count: Math.floor(totalUsers * 0.18) },
      { range: "500-649", percentage: 12, count: Math.floor(totalUsers * 0.12) },
    ]
  };
};