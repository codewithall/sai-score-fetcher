import { useState } from "react";
import { Hero } from "@/components/Hero";
import { WalletInput } from "@/components/WalletInput";
import { CreditScoreDisplay } from "@/components/CreditScoreDisplay";
import { CreditScoreComparison } from "@/components/CreditScoreComparison";
import { Chatbot } from "@/components/Chatbot";
import { useToast } from "@/hooks/use-toast";
import { calculateCreditScore, generateComparisonData } from "@/services/seiApi";

const Index = () => {
  const [creditData, setCreditData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleWalletSubmit = async (walletAddress: string) => {
    setIsLoading(true);
    setCreditData(null);
    setComparisonData(null);
    
    try {
      // Fetch real blockchain data and calculate credit score
      const data = await calculateCreditScore(walletAddress);
      const comparison = generateComparisonData(data.score);
      
      setCreditData(data);
      setComparisonData(comparison);
      
      toast({
        title: "Credit Score Retrieved",
        description: `Successfully analyzed wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} from SEI Network`,
      });
    } catch (error) {
      console.error("Credit score calculation error:", error);
      toast({
        title: "Error",
        description: "Failed to fetch credit score from SEI Network. Please check the wallet address and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Hero />
      
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          {!creditData ? (
            <WalletInput onSubmit={handleWalletSubmit} isLoading={isLoading} />
          ) : (
            <div className="space-y-8">
              <CreditScoreDisplay data={creditData} />
              {comparisonData && (
                <CreditScoreComparison data={comparisonData} />
              )}
              <div className="text-center">
                <button
                  onClick={() => {
                    setCreditData(null);
                    setComparisonData(null);
                  }}
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Check Another Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      
      <Chatbot />
    </div>
  );
};

export default Index;
