import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Award, Target } from "lucide-react";

interface ComparisonData {
  userScore: number;
  percentile: number;
  averageScore: number;
  totalUsers: number;
  scoreDistribution: {
    range: string;
    percentage: number;
    count: number;
  }[];
  rank: number;
}

interface CreditScoreComparisonProps {
  data: ComparisonData;
}

export const CreditScoreComparison = ({ data }: CreditScoreComparisonProps) => {
  const getPercentileColor = (percentile: number) => {
    if (percentile >= 90) return "text-green-600";
    if (percentile >= 75) return "text-blue-600";
    if (percentile >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getPercentileBadge = (percentile: number) => {
    if (percentile >= 95) return { label: "Exceptional", variant: "default" as const };
    if (percentile >= 90) return { label: "Excellent", variant: "secondary" as const };
    if (percentile >= 75) return { label: "Good", variant: "outline" as const };
    if (percentile >= 50) return { label: "Average", variant: "outline" as const };
    return { label: "Below Average", variant: "destructive" as const };
  };

  const badge = getPercentileBadge(data.percentile);

  return (
    <div className="space-y-6">
      {/* Overall Comparison */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Your Score vs Network
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{data.userScore}</div>
              <div className="text-sm text-muted-foreground">Your Score</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{data.averageScore}</div>
              <div className="text-sm text-muted-foreground">Network Average</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className={`text-2xl font-bold ${getPercentileColor(data.percentile)}`}>
                {data.percentile}th
              </div>
              <div className="text-sm text-muted-foreground">Percentile</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Your Position</span>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <Progress value={data.percentile} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0th percentile</span>
              <span>100th percentile</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ranking Information */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Network Ranking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 to-transparent rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">
                #{data.rank}
              </div>
              <div>
                <div className="font-semibold">Your Rank</div>
                <div className="text-sm text-muted-foreground">
                  Out of {data.totalUsers.toLocaleString()} users
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Better than</div>
              <div className="text-lg font-bold text-primary">
                {((data.totalUsers - data.rank) / data.totalUsers * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score Distribution */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Score Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.scoreDistribution.map((dist, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{dist.range}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {dist.count.toLocaleString()} users
                  </span>
                  <span className="text-sm font-medium">{dist.percentage}%</span>
                </div>
              </div>
              <Progress value={dist.percentage} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Improvement Tips */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            How to Improve
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            {data.percentile < 75 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="font-medium text-blue-900 dark:text-blue-100">Increase Transaction Activity</div>
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  Regular transactions show consistent network usage
                </div>
              </div>
            )}
            {data.percentile < 85 && (
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="font-medium text-green-900 dark:text-green-100">Participate in DeFi</div>
                <div className="text-sm text-green-700 dark:text-green-300">
                  Engage with DeFi protocols to boost your score
                </div>
              </div>
            )}
            {data.percentile < 90 && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="font-medium text-purple-900 dark:text-purple-100">Stake SEI Tokens</div>
                <div className="text-sm text-purple-700 dark:text-purple-300">
                  Staking demonstrates long-term commitment to the network
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};