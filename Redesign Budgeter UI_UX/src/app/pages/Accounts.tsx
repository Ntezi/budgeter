import { useState } from "react";
import { useApp, Account } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Bell, Check } from "lucide-react";
import { toast } from "sonner";

export function Accounts() {
  const { accounts, addAccount, updateAccount, transactions } = useApp();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: "", type: "Checking" as Account['type'], balance: "0" });

  const handleAdd = () => {
     if (!newAccount.name) return;
     const balance = parseFloat(newAccount.balance);
     if (isNaN(balance)) {
        toast.error("Invalid opening balance");
        return;
     }
     addAccount({
        name: newAccount.name,
        type: newAccount.type,
        balance
     });
     setNewAccount({ name: "", type: "Checking", balance: "0" });
     setIsDialogOpen(false);
     toast.success("Account created");
  };
  
  const getComputedBalance = (account: Account) => {
     const relatedTransactions = transactions.filter(t => t.accountId === account.id);
     const income = relatedTransactions.filter(t => t.category === 'Income').reduce((sum, t) => sum + t.amount, 0);
     const expense = relatedTransactions.filter(t => t.category !== 'Income').reduce((sum, t) => sum + t.amount, 0);
     return account.balance + income - expense;
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div>
             <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
             <p className="text-muted-foreground">Manage your bank accounts and credit cards.</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
             <DialogTrigger asChild>
                <Button>
                   <Plus className="mr-2 h-4 w-4" /> Add Account
                </Button>
             </DialogTrigger>
             <DialogContent>
                <DialogHeader>
                   <DialogTitle>Add New Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                   <div className="space-y-2">
                      <label className="text-sm font-medium">Name</label>
                      <Input value={newAccount.name} onChange={(e) => setNewAccount({...newAccount, name: e.target.value})} placeholder="e.g. Main Checking" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-sm font-medium">Type</label>
                      <Select value={newAccount.type} onValueChange={(v) => setNewAccount({...newAccount, type: v as Account['type']})}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                            <SelectItem value="Checking">Checking</SelectItem>
                            <SelectItem value="Savings">Savings</SelectItem>
                            <SelectItem value="Credit">Credit Card</SelectItem>
                            <SelectItem value="Investment">Investment</SelectItem>
                         </SelectContent>
                      </Select>
                   </div>
                   <div className="space-y-2">
                      <label className="text-sm font-medium">Opening Balance</label>
                      <Input type="number" value={newAccount.balance} onChange={(e) => setNewAccount({...newAccount, balance: e.target.value})} />
                   </div>
                </div>
                <DialogFooter>
                   <Button onClick={handleAdd}>Create Account</Button>
                </DialogFooter>
             </DialogContent>
          </Dialog>
       </div>

       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map(account => {
             const currentBalance = getComputedBalance(account);
             const isNegative = currentBalance < 0;
             
             return (
               <Card key={account.id} className="relative group overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full ${account.type === 'Checking' ? 'bg-blue-500' : account.type === 'Savings' ? 'bg-green-500' : account.type === 'Credit' ? 'bg-purple-500' : 'bg-orange-500'}`} />
                  <CardHeader className="pb-2">
                     <div className="flex justify-between items-start">
                        <div>
                           <CardTitle>{account.name}</CardTitle>
                           <p className="text-xs text-muted-foreground uppercase tracking-wider">{account.type}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                           <Edit2 className="h-4 w-4" />
                        </Button>
                     </div>
                  </CardHeader>
                  <CardContent>
                     <div className={`text-3xl font-bold ${isNegative ? "text-red-600" : "text-foreground"}`}>
                        ${currentBalance.toLocaleString()}
                     </div>
                     <p className="text-xs text-muted-foreground mt-1">
                        Opening: ${account.balance.toLocaleString()}
                     </p>
                  </CardContent>
                  <CardFooter className="bg-muted/30 p-4 border-t flex justify-between items-center">
                     <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Bell className="h-4 w-4" />
                        <span>Reminders off</span>
                     </div>
                     <Switch />
                  </CardFooter>
               </Card>
             );
          })}
       </div>
    </div>
  );
}
