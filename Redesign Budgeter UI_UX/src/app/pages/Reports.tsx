import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Download, FileDown, RefreshCw } from "lucide-react";
import { format, parseISO, startOfYear, eachMonthOfInterval, endOfYear } from "date-fns";
import { toast } from "sonner";

export function Reports() {
  const { budgets, transactions } = useApp();

  // Prepare data for monthly trend (Income vs Spending)
  const monthlyData = useMemo(() => {
    const start = startOfYear(new Date());
    const end = endOfYear(new Date());
    const months = eachMonthOfInterval({ start, end });

    return months.map(month => {
       const monthStr = format(month, "yyyy-MM");
       const budget = budgets.find(b => b.period === monthStr);
       
       // Calculate actuals from transactions
       const monthTransactions = transactions.filter(t => t.date.startsWith(monthStr));
       const income = monthTransactions.filter(t => t.category === 'Income').reduce((sum, t) => sum + t.amount, 0);
       const expense = monthTransactions.filter(t => t.category !== 'Income').reduce((sum, t) => sum + t.amount, 0);
       
       return {
          name: format(month, "MMM"),
          Income: income,
          Expenses: expense,
          Net: income - expense
       };
    });
  }, [budgets, transactions]);

  const handleExport = () => {
     toast.success("Exporting report to Excel...");
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div>
             <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
             <p className="text-muted-foreground">Analyze your income and spending trends.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" onClick={() => toast.success("Refreshed data")}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
             </Button>
             <Button onClick={handleExport}>
                <FileDown className="mr-2 h-4 w-4" /> Export Excel
             </Button>
          </div>
       </div>

       <div className="grid gap-6 md:grid-cols-2">
          <Card className="col-span-2">
             <CardHeader>
                <CardTitle>Income vs Expenses (Year to Date)</CardTitle>
                <CardDescription>Monthly cash flow analysis.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} />
                         <XAxis dataKey="name" />
                         <YAxis />
                         <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                         <Legend />
                         <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                         <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
                </div>
             </CardContent>
          </Card>

          <Card>
             <CardHeader>
                <CardTitle>Net Savings Trend</CardTitle>
                <CardDescription>Your monthly surplus/deficit.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} />
                         <XAxis dataKey="name" />
                         <YAxis />
                         <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                         <Legend />
                         <Line type="monotone" dataKey="Net" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                   </ResponsiveContainer>
                </div>
             </CardContent>
          </Card>
          
          <Card>
             <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
                <CardDescription>Expense distribution by category (All Time).</CardDescription>
             </CardHeader>
             <CardContent>
                {/* Aggregate data */}
                {(() => {
                   const breakdown = transactions.reduce((acc, t) => {
                      if (t.category === 'Income') return acc;
                      acc[t.category] = (acc[t.category] || 0) + t.amount;
                      return acc;
                   }, {} as Record<string, number>);
                   
                   const data = Object.entries(breakdown).map(([name, value]) => ({ name, value }));
                   const total = data.reduce((sum, d) => sum + d.value, 0);

                   return (
                      <div className="space-y-4">
                         {data.map(item => (
                            <div key={item.name} className="space-y-1">
                               <div className="flex justify-between text-sm">
                                  <span>{item.name}</span>
                                  <span className="font-medium">${item.value.toLocaleString()} ({total > 0 ? Math.round((item.value/total)*100) : 0}%)</span>
                               </div>
                               <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${total > 0 ? (item.value/total)*100 : 0}%` }} />
                               </div>
                            </div>
                         ))}
                      </div>
                   );
                })()}
             </CardContent>
          </Card>
       </div>
    </div>
  );
}
