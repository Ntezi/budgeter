import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Budget, IncomeSource } from "@/lib/store";

interface IncomeSectionProps {
  budget: Budget;
  isLocked: boolean;
  onUpdate: (income: IncomeSource[]) => void;
}

export function IncomeSection({ budget, isLocked, onUpdate }: IncomeSectionProps) {
  const [newSource, setNewSource] = useState({ name: "", amount: "" });

  const handleAdd = () => {
    if (!newSource.name || !newSource.amount) return;
    const amount = parseFloat(newSource.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    onUpdate([
      ...budget.income,
      { id: Math.random().toString(36).substr(2, 9), name: newSource.name, amount }
    ]);
    setNewSource({ name: "", amount: "" });
  };

  const handleRemove = (id: string) => {
    onUpdate(budget.income.filter(i => i.id !== id));
  };

  const handleEdit = (id: string, field: 'name' | 'amount', value: string) => {
    const updated = budget.income.map(item => {
      if (item.id === id) {
        if (field === 'amount') {
          const val = parseFloat(value);
          return { ...item, amount: isNaN(val) ? 0 : val };
        }
        return { ...item, name: value };
      }
      return item;
    });
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Income Sources</h3>
        {isLocked && <span className="text-sm text-muted-foreground italic">Locked in Decided mode</span>}
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source Name</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {!isLocked && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {budget.income.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {isLocked ? (
                    item.name
                  ) : (
                    <Input 
                      value={item.name} 
                      onChange={(e) => handleEdit(item.id, 'name', e.target.value)} 
                      className="h-8 w-full max-w-[200px]"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLocked ? (
                    `$${item.amount.toLocaleString()}`
                  ) : (
                    <Input 
                      type="number" 
                      value={item.amount} 
                      onChange={(e) => handleEdit(item.id, 'amount', e.target.value)} 
                      className="h-8 w-full max-w-[120px] ml-auto text-right"
                    />
                  )}
                </TableCell>
                {!isLocked && (
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            
            {!isLocked && (
              <TableRow className="bg-muted/50">
                <TableCell>
                  <Input 
                    placeholder="New source..." 
                    value={newSource.name} 
                    onChange={(e) => setNewSource({...newSource, name: e.target.value})}
                    className="h-8 w-full max-w-[200px]"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={newSource.amount} 
                    onChange={(e) => setNewSource({...newSource, amount: e.target.value})}
                    className="h-8 w-full max-w-[120px] ml-auto text-right"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={handleAdd} disabled={!newSource.name || !newSource.amount}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
            
             <TableRow className="bg-muted font-medium">
                <TableCell>Total Income</TableCell>
                <TableCell className="text-right">
                   ${budget.income.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}
                </TableCell>
                {!isLocked && <TableCell></TableCell>}
             </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
