import { useState, useMemo } from "react";
import { useApp, Transaction, Category } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Filter, RefreshCw } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { toast } from "sonner";

export function Transactions() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, accounts } = useApp();
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "yyyy-MM"));
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [newTransaction, setNewTransaction] = useState({ 
    date: format(new Date(), "yyyy-MM-dd"), 
    description: "", 
    amount: "", 
    category: "Needs" as Category | 'Income',
    accountId: ""
  });

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const date = parseISO(t.date);
      const monthMatch = format(date, "yyyy-MM") === filterMonth;
      const catMatch = filterCategory === "all" || t.category === filterCategory;
      return monthMatch && catMatch;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterMonth, filterCategory]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => {
      if (t.category === 'Income') {
        acc.income += t.amount;
      } else {
        acc.spent += t.amount;
      }
      return acc;
    }, { income: 0, spent: 0 });
  }, [filteredTransactions]);

  const handleAdd = () => {
    if (!newTransaction.description || !newTransaction.amount) return;
    const amount = parseFloat(newTransaction.amount);
    if (isNaN(amount) || amount <= 0) {
       toast.error("Invalid amount");
       return;
    }
    addTransaction({
       ...newTransaction,
       amount
    });
    setNewTransaction({ ...newTransaction, description: "", amount: "" });
    toast.success("Transaction added");
  };

  const handleEdit = (id: string, field: keyof Transaction, value: any) => {
    const t = transactions.find(t => t.id === id);
    if (!t) return;
    updateTransaction({ ...t, [field]: value });
  };
  
  const generateRecurring = () => {
     // This would normally fetch templates. For now, mock it.
     toast.info("Recurring templates would be generated here.");
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
         <div>
            <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
            <p className="text-muted-foreground">Record your income and expenses.</p>
         </div>
         <div className="flex gap-2">
            <Button variant="outline" onClick={generateRecurring}>
               <RefreshCw className="mr-2 h-4 w-4" />
               Generate Recurring
            </Button>
         </div>
       </div>

       <div className="grid gap-4 md:grid-cols-3">
          <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Income ({filterMonth})</CardTitle></CardHeader>
             <CardContent><div className="text-2xl font-bold text-green-600">+${totals.income.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Expenses ({filterMonth})</CardTitle></CardHeader>
             <CardContent><div className="text-2xl font-bold text-red-600">-${totals.spent.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Net ({filterMonth})</CardTitle></CardHeader>
             <CardContent><div className={`text-2xl font-bold ${totals.income - totals.spent >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totals.income - totals.spent >= 0 ? "+" : ""}${(totals.income - totals.spent).toLocaleString()}
             </div></CardContent>
          </Card>
       </div>

       <div className="flex gap-4 items-center p-4 bg-muted/20 rounded-lg border">
          <div className="flex items-center gap-2">
             <Filter className="h-4 w-4 text-muted-foreground" />
             <span className="text-sm font-medium">Filters:</span>
          </div>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
             <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Month" />
             </SelectTrigger>
             <SelectContent>
                {/* Generate last 12 months options */}
                {Array.from({ length: 12 }).map((_, i) => {
                   const d = new Date();
                   d.setMonth(d.getMonth() - i);
                   const val = format(d, "yyyy-MM");
                   return <SelectItem key={val} value={val}>{format(d, "MMMM yyyy")}</SelectItem>;
                })}
             </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
             <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
             </SelectTrigger>
             <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Income">Income</SelectItem>
                <SelectItem value="Needs">Needs</SelectItem>
                <SelectItem value="Wants">Wants</SelectItem>
                <SelectItem value="Savings-Debt">Savings-Debt</SelectItem>
             </SelectContent>
          </Select>
       </div>

       <div className="rounded-md border">
          <Table>
             <TableHeader>
                <TableRow>
                   <TableHead className="w-[120px]">Date</TableHead>
                   <TableHead>Description</TableHead>
                   <TableHead className="w-[120px]">Account</TableHead>
                   <TableHead className="w-[150px]">Category</TableHead>
                   <TableHead className="text-right w-[120px]">Amount</TableHead>
                   <TableHead className="w-[50px]"></TableHead>
                </TableRow>
             </TableHeader>
             <TableBody>
                {/* Add Row */}
                <TableRow className="bg-muted/50 border-b-2">
                   <TableCell>
                      <Input 
                         type="date" 
                         value={newTransaction.date} 
                         onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                         className="h-8"
                      />
                   </TableCell>
                   <TableCell>
                      <Input 
                         placeholder="New transaction..." 
                         value={newTransaction.description} 
                         onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                         className="h-8"
                      />
                   </TableCell>
                   <TableCell>
                      <Select 
                        value={newTransaction.accountId} 
                        onValueChange={(v) => setNewTransaction({...newTransaction, accountId: v})}
                      >
                         <SelectTrigger className="h-8"><SelectValue placeholder="Account" /></SelectTrigger>
                         <SelectContent>
                            {accounts.map(acc => (
                               <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                            ))}
                         </SelectContent>
                      </Select>
                   </TableCell>
                   <TableCell>
                      <Select 
                        value={newTransaction.category} 
                        onValueChange={(v) => setNewTransaction({...newTransaction, category: v as Category | 'Income'})}
                      >
                         <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                         <SelectContent>
                            <SelectItem value="Income">Income</SelectItem>
                            <SelectItem value="Needs">Needs</SelectItem>
                            <SelectItem value="Wants">Wants</SelectItem>
                            <SelectItem value="Savings-Debt">Savings</SelectItem>
                         </SelectContent>
                      </Select>
                   </TableCell>
                   <TableCell>
                      <Input 
                         type="number" 
                         value={newTransaction.amount} 
                         onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                         className="h-8 text-right"
                         placeholder="0.00"
                         onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                      />
                   </TableCell>
                   <TableCell>
                      <Button size="icon" variant="ghost" onClick={handleAdd} disabled={!newTransaction.description || !newTransaction.amount}>
                         <Plus className="h-4 w-4" />
                      </Button>
                   </TableCell>
                </TableRow>

                {filteredTransactions.map(t => (
                   <TableRow key={t.id}>
                      <TableCell>
                         <Input 
                            type="date" 
                            value={t.date} 
                            onChange={(e) => handleEdit(t.id, 'date', e.target.value)}
                            className="h-8 border-transparent hover:border-input focus:border-input bg-transparent"
                         />
                      </TableCell>
                      <TableCell>
                         <Input 
                            value={t.description} 
                            onChange={(e) => handleEdit(t.id, 'description', e.target.value)}
                            className="h-8 border-transparent hover:border-input focus:border-input bg-transparent"
                         />
                      </TableCell>
                      <TableCell>
                         <Select 
                           value={t.accountId || ""} 
                           onValueChange={(v) => handleEdit(t.id, 'accountId', v)}
                         >
                            <SelectTrigger className="h-8 border-transparent hover:border-input focus:border-input bg-transparent">
                               <SelectValue placeholder="No Account" />
                            </SelectTrigger>
                            <SelectContent>
                               {accounts.map(acc => (
                                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                               ))}
                            </SelectContent>
                         </Select>
                      </TableCell>
                      <TableCell>
                         <Select 
                           value={t.category} 
                           onValueChange={(v) => handleEdit(t.id, 'category', v)}
                         >
                            <SelectTrigger className="h-8 border-transparent hover:border-input focus:border-input bg-transparent">
                               <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="Income">Income</SelectItem>
                               <SelectItem value="Needs">Needs</SelectItem>
                               <SelectItem value="Wants">Wants</SelectItem>
                               <SelectItem value="Savings-Debt">Savings</SelectItem>
                            </SelectContent>
                         </Select>
                      </TableCell>
                      <TableCell>
                         <Input 
                            type="number" 
                            value={t.amount} 
                            onChange={(e) => handleEdit(t.id, 'amount', parseFloat(e.target.value))}
                            className={`h-8 text-right border-transparent hover:border-input focus:border-input bg-transparent font-medium ${t.category === 'Income' ? 'text-green-600' : ''}`}
                         />
                      </TableCell>
                      <TableCell>
                         <Button size="icon" variant="ghost" onClick={() => deleteTransaction(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive/50 hover:text-destructive" />
                         </Button>
                      </TableCell>
                   </TableRow>
                ))}
                {filteredTransactions.length === 0 && (
                   <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No transactions found for this period.</TableCell></TableRow>
                )}
             </TableBody>
          </Table>
       </div>
    </div>
  );
}
