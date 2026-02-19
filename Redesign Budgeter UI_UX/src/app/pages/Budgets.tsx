import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight, Calendar, Lock, Unlock } from "lucide-react";
import { useNavigate } from "react-router";
import { format, parseISO, addMonths } from "date-fns";

export function Budgets() {
  const { budgets, addBudget } = useApp();
  const navigate = useNavigate();

  const handleCreateBudget = () => {
    // Determine next month
    const latestBudget = budgets.reduce((latest, current) => {
       return current.period > latest.period ? current : latest;
    }, budgets[0]);
    
    // If no budgets, start with current month.
    let nextMonth = format(new Date(), "yyyy-MM");
    
    if (latestBudget) {
       const latestDate = parseISO(latestBudget.period + "-01");
       nextMonth = format(addMonths(latestDate, 1), "yyyy-MM");
    }
    
    // Check if budget exists (shouldn't if we use latest + 1)
    if (!budgets.find(b => b.period === nextMonth)) {
       addBudget(nextMonth);
       // Navigate will happen after state update, or we can find it.
       // Since addBudget is sync in our mock store, we can navigate immediately?
       // We don't have the ID immediately returned from addBudget.
       // I need to modify addBudget to return the new budget or ID.
       // For now, I'll just refresh list.
    }
  };

  // Sort budgets descending
  const sortedBudgets = [...budgets].sort((a, b) => b.period.localeCompare(a.period));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
          <p className="text-muted-foreground">Plan and track your money.</p>
        </div>
        <Button onClick={handleCreateBudget}>
          <Plus className="mr-2 h-4 w-4" />
          New Budget
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedBudgets.map((budget) => {
          const date = parseISO(budget.period + "-01");
          const isDecided = budget.status === "Decided";
          const incomeTotal = budget.income.reduce((sum, i) => sum + i.amount, 0);
          const planTotal = budget.plan.reduce((sum, p) => sum + p.amount, 0);

          return (
            <Card 
              key={budget.id} 
              className="cursor-pointer hover:shadow-md transition-shadow group relative overflow-hidden"
              onClick={() => navigate(`/budgets/${budget.id}`)}
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${isDecided ? "bg-slate-500" : "bg-green-500"}`} />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{format(date, "MMMM yyyy")}</CardTitle>
                    <CardDescription>{isDecided ? "Locked Plan" : "Draft Mode"}</CardDescription>
                  </div>
                  <Badge variant={isDecided ? "outline" : "default"} className={isDecided ? "bg-muted" : "bg-green-100 text-green-700 hover:bg-green-200"}>
                    {isDecided ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                    {budget.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Income</span>
                    <span className="font-medium">${incomeTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Planned</span>
                    <span className="font-medium">${planTotal.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 flex items-center text-primary font-medium group-hover:underline">
                    Open Budget <ArrowRight className="ml-2 w-4 h-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
