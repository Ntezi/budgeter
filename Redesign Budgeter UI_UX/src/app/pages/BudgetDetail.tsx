import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useApp, Budget, PlanItem, IncomeSource } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Lock, Unlock, Trash2, CheckCircle, Calculator } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { IncomeSection } from "@/components/budget/IncomeSection";
import { PlanSection } from "@/components/budget/PlanSection";
import { ReconcileSection } from "@/components/budget/ReconcileSection";

export function BudgetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { budgets, updateBudget, deleteBudget } = useApp();
  const budget = budgets.find((b) => b.id === id);

  if (!budget) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <h2 className="text-2xl font-bold">Budget Not Found</h2>
        <Button onClick={() => navigate("/budgets")}>Back to Budgets</Button>
      </div>
    );
  }

  const isDecided = budget.status === "Decided";
  const date = parseISO(budget.period + "-01");

  const totalIncome = budget.income.reduce((sum, i) => sum + i.amount, 0);
  const totalAllocated = budget.plan.reduce((sum, p) => sum + p.amount, 0);
  const unallocated = totalIncome - totalAllocated;

  const handleFinalize = () => {
    if (budget.status === "Draft") {
      updateBudget({ ...budget, status: "Decided" });
      toast.success("Budget finalized! Income and Plan are now locked.");
    } else {
        // Allow reverting to Draft?
        // Prompt implies "Decided locks Income + Plan edits".
        // Usually safer to allow revert if user made a mistake.
        updateBudget({ ...budget, status: "Draft" });
        toast.info("Budget reverted to Draft mode.");
    }
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this budget?")) {
      deleteBudget(budget.id);
      toast.success("Budget deleted.");
      navigate("/budgets");
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{format(date, "MMMM yyyy")}</h1>
            <Badge variant={isDecided ? "secondary" : "default"} className="text-sm px-3 py-1">
              {isDecided ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
              {budget.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
             {isDecided ? "Plan is locked. Allocations remain editable." : "Adjust your income and spending plan."}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
           <Button variant={isDecided ? "outline" : "default"} onClick={handleFinalize}>
             {isDecided ? "Revert to Draft" : "Finalize Budget"}
           </Button>
           <Button variant="destructive" size="icon" onClick={handleDelete}>
             <Trash2 className="w-4 h-4" />
           </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
         <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Income</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">${totalIncome.toLocaleString()}</div></CardContent>
         </Card>
         <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Planned Spending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">${totalAllocated.toLocaleString()}</div></CardContent>
         </Card>
         <Card className={unallocated < 0 ? "border-red-500 bg-red-50 dark:bg-red-900/10" : "border-green-500 bg-green-50 dark:bg-green-900/10"}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Unallocated Income</CardTitle></CardHeader>
            <CardContent>
               <div className={`text-2xl font-bold ${unallocated < 0 ? "text-red-600" : "text-green-600"}`}>
                  {unallocated >= 0 ? "+" : ""}${unallocated.toLocaleString()}
               </div>
            </CardContent>
         </Card>
      </div>

      {/* Main Sections */}
      <Tabs defaultValue="plan" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="plan">Spending Plan</TabsTrigger>
          <TabsTrigger value="reconcile">Reconcile Allocations</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="mt-6">
           <IncomeSection budget={budget} isLocked={isDecided} onUpdate={(newIncome) => updateBudget({...budget, income: newIncome})} />
        </TabsContent>

        <TabsContent value="plan" className="mt-6">
           <PlanSection budget={budget} isLocked={isDecided} onUpdate={(newPlan) => updateBudget({...budget, plan: newPlan})} />
        </TabsContent>

        <TabsContent value="reconcile" className="mt-6">
           <ReconcileSection budget={budget} onUpdate={(newPlan) => updateBudget({...budget, plan: newPlan})} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
