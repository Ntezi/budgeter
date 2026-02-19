import { useMemo, useState } from "react";
import { useApp, Budget, Transaction } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowUpRight, ArrowDownRight, Wallet, AlertCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router";

export function Dashboard() {
  const { budgets, transactions, addBudget } = useApp();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"auto" | "manual">("manual");

  // Get current month's budget
  const currentMonth = format(new Date(), "yyyy-MM");
  const currentBudget = budgets.find((b) => b.period === currentMonth);
  
  // Calculate totals
  const totalIncome = currentBudget?.income.reduce((sum, item) => sum + item.amount, 0) || 0;
  const totalAllocated = currentBudget?.plan.reduce((sum, item) => sum + item.amount, 0) || 0;
  
  // Calculate spent based on transactions in this month
  const currentTransactions = transactions.filter((t) => {
    const date = parseISO(t.date);
    return isWithinInterval(date, {
      start: startOfMonth(new Date()),
      end: endOfMonth(new Date()),
    });
  });
  
  const totalSpent = currentTransactions
    .filter((t) => t.category !== "Income")
    .reduce((sum, t) => sum + t.amount, 0);

  const surplus = totalIncome - totalSpent;

  // Breakdown by category (Needs, Wants, Savings-Debt)
  const breakdown = useMemo(() => {
    const data = {
      Needs: 0,
      Wants: 0,
      "Savings-Debt": 0,
    };
    
    // Use plan for allocation breakdown
    currentBudget?.plan.forEach((item) => {
      if (data[item.category] !== undefined) {
        data[item.category] += item.amount;
      }
    });
    
    return [
      { name: "Needs", value: data.Needs, color: "#3b82f6" }, // Blue
      { name: "Wants", value: data.Wants, color: "#ec4899" }, // Pink
      { name: "Savings", value: data["Savings-Debt"], color: "#22c55e" }, // Green
    ];
  }, [currentBudget]);

  const COLORS = ["#3b82f6", "#ec4899", "#22c55e"];

  // Handle New Budget
  const handleNewBudget = () => {
    const nextMonth = format(addMonths(new Date(), 1), "yyyy-MM");
    // Check if exists
    if (budgets.find(b => b.period === nextMonth)) {
      navigate(`/budgets`); // Go to list if already exists
    } else {
      addBudget(nextMonth);
      navigate(`/budgets`);
    }
  };

  // Helper for date manipulation (since I can't import addMonths easily in the component body without importing it)
  // I imported addMonths from date-fns already in store, let me check imports here.
  // Ah, I missed addMonths in imports.

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview for {format(new Date(), "MMMM yyyy")}</p>
        </div>
        <Button onClick={() => navigate("/budgets")}>
          <Plus className="mr-2 h-4 w-4" />
          Manage Budgets
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalIncome.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Planned for this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSpent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Actual transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Surplus</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${surplus >= 0 ? "text-green-600" : "text-red-600"}`}>
              {surplus >= 0 ? "+" : ""}${surplus.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Income - Spent</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Health</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
             {/* Simple health metric */}
            <div className="text-2xl font-bold">
                {totalIncome > 0 ? Math.round(((totalIncome - totalSpent) / totalIncome) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Savings rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-7">
        
        {/* Spending Mix & Progress */}
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Spending Plan</CardTitle>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "auto" | "manual")} className="w-[200px]">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="auto">Auto 50/30/20</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <CardDescription>
              {viewMode === "auto" ? "Projected breakdown based on 50/30/20 rule." : "Actual breakdown based on your budget items."}
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="h-[300px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={viewMode === "auto" ? [
                        { name: "Needs", value: 50, color: "#3b82f6" },
                        { name: "Wants", value: 30, color: "#ec4899" },
                        { name: "Savings", value: 20, color: "#22c55e" }
                      ] : breakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {(viewMode === "auto" ? [
                        { name: "Needs", value: 50, color: "#3b82f6" },
                        { name: "Wants", value: 30, color: "#ec4899" },
                        { name: "Savings", value: 20, color: "#22c55e" }
                      ] : breakdown).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
             </div>
             
             {/* Progress Bars for Categories */}
             <div className="space-y-4 mt-4">
                {breakdown.map((item) => {
                   const percent = totalAllocated > 0 ? (item.value / totalAllocated) * 100 : 0;
                   return (
                     <div key={item.name} className="space-y-1">
                       <div className="flex justify-between text-sm">
                         <span>{item.name}</span>
                         <span className="font-medium">{Math.round(percent)}% ({item.value.toLocaleString()})</span>
                       </div>
                       <Progress value={percent} className="h-2" indicatorClassName={`bg-[${item.color}]`} />
                     </div>
                   );
                })}
             </div>
          </CardContent>
        </Card>

        {/* Recent Budgets List */}
        <Card className="col-span-3">
          <CardHeader>
             <CardTitle>Recent Budgets</CardTitle>
             <CardDescription>Your planning history</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                {budgets.slice(0, 5).map((budget) => (
                   <div 
                      key={budget.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/budgets/${budget.id}`)}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{format(parseISO(budget.period + "-01"), "MMMM yyyy")}</p>
                        <p className="text-xs text-muted-foreground">{budget.income.length} Income Sources</p>
                      </div>
                      <Badge variant={budget.status === "Decided" ? "default" : "secondary"}>
                        {budget.status}
                      </Badge>
                   </div>
                ))}
                
                <Button variant="outline" className="w-full" onClick={() => navigate("/budgets")}>
                   View All Budgets
                </Button>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function addMonths(date: Date, amount: number) {
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() + amount);
    return newDate;
}
