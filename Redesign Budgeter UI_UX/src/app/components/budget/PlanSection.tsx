import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Budget, PlanItem, Category } from "@/lib/store";
import { Progress } from "@/components/ui/progress";

interface PlanSectionProps {
  budget: Budget;
  isLocked: boolean;
  onUpdate: (plan: PlanItem[]) => void;
}

export function PlanSection({ budget, isLocked, onUpdate }: PlanSectionProps) {
  const [newItem, setNewItem] = useState({ name: "", amount: "", category: "Needs" as Category });
  
  const totalIncome = budget.income.reduce((sum, i) => sum + i.amount, 0);
  
  const groupedPlan = useMemo(() => {
    const groups = {
      "Needs": [] as PlanItem[],
      "Wants": [] as PlanItem[],
      "Savings-Debt": [] as PlanItem[],
    };
    budget.plan.forEach(item => {
      if (groups[item.category]) groups[item.category].push(item);
    });
    return groups;
  }, [budget.plan]);

  const categoryTotals = useMemo(() => {
    return {
      "Needs": groupedPlan["Needs"].reduce((sum, i) => sum + i.amount, 0),
      "Wants": groupedPlan["Wants"].reduce((sum, i) => sum + i.amount, 0),
      "Savings-Debt": groupedPlan["Savings-Debt"].reduce((sum, i) => sum + i.amount, 0),
    };
  }, [groupedPlan]);

  const handleAdd = () => {
    if (!newItem.name || !newItem.amount) return;
    const amount = parseFloat(newItem.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount");
      return;
    }
    
    // Assign lowest priority (highest number)
    const maxPriority = budget.plan.reduce((max, i) => Math.max(max, i.priority), 0);

    onUpdate([
      ...budget.plan,
      { 
        id: Math.random().toString(36).substr(2, 9), 
        name: newItem.name, 
        amount, 
        category: newItem.category,
        priority: maxPriority + 1 
      }
    ]);
    setNewItem({ ...newItem, name: "", amount: "" });
  };

  const handleRemove = (id: string) => {
    onUpdate(budget.plan.filter(i => i.id !== id));
  };

  const handleEdit = (id: string, field: 'name' | 'amount', value: string) => {
    const updated = budget.plan.map(item => {
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
  
  const applyAutoRule = () => {
    if (isLocked) return;
    if (budget.plan.length > 0 && !window.confirm("This will overwrite your current plan. Continue?")) return;
    
    const needs = totalIncome * 0.5;
    const wants = totalIncome * 0.3;
    const savings = totalIncome * 0.2;
    
    const newPlan: PlanItem[] = [
      { id: Math.random().toString(36).substr(2, 9), name: "General Needs", category: "Needs", amount: needs, priority: 1 },
      { id: Math.random().toString(36).substr(2, 9), name: "General Wants", category: "Wants", amount: wants, priority: 2 },
      { id: Math.random().toString(36).substr(2, 9), name: "Savings Goal", category: "Savings-Debt", amount: savings, priority: 3 },
    ];
    
    onUpdate(newPlan);
    toast.success("Applied 50/30/20 rule.");
  };

  return (
    <div className="space-y-8">
      
      {/* 50/30/20 Visualizer */}
      <div className="grid grid-cols-3 gap-4">
         {(['Needs', 'Wants', 'Savings-Debt'] as const).map(cat => {
            const total = categoryTotals[cat];
            const percent = totalIncome > 0 ? (total / totalIncome) * 100 : 0;
            const target = cat === 'Needs' ? 50 : cat === 'Wants' ? 30 : 20;
            const color = cat === 'Needs' ? 'bg-blue-500' : cat === 'Wants' ? 'bg-pink-500' : 'bg-green-500';
            
            return (
              <div key={cat} className="space-y-2 p-4 border rounded-lg bg-card/50">
                 <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{cat}</span>
                    <span className="text-xs text-muted-foreground">Target: {target}%</span>
                 </div>
                 <div className="text-2xl font-bold">${total.toLocaleString()}</div>
                 <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                       <span>{Math.round(percent)}% of Income</span>
                    </div>
                    <Progress value={percent} className="h-2" indicatorClassName={color} />
                 </div>
              </div>
            );
         })}
      </div>

      <div className="flex justify-end">
         {!isLocked && (
           <Button variant="outline" size="sm" onClick={applyAutoRule}>
             <Calculator className="mr-2 h-4 w-4" />
             Auto-Fill 50/30/20
           </Button>
         )}
      </div>

      {/* Tables per Category */}
      {(['Needs', 'Wants', 'Savings-Debt'] as const).map(category => (
        <div key={category} className="space-y-2">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${category === 'Needs' ? 'bg-blue-500' : category === 'Wants' ? 'bg-pink-500' : 'bg-green-500'}`} />
            {category}
          </h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {!isLocked && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedPlan[category].map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {isLocked ? item.name : (
                        <Input 
                          value={item.name} 
                          onChange={(e) => handleEdit(item.id, 'name', e.target.value)} 
                          className="h-8 w-full max-w-[200px]"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isLocked ? `$${item.amount.toLocaleString()}` : (
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
                {groupedPlan[category].length === 0 && (
                   <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No items planned</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}

      {/* Add New Item */}
      {!isLocked && (
        <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
           <h4 className="font-medium">Add Plan Item</h4>
           <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-1">
                 <label className="text-xs font-medium">Name</label>
                 <Input 
                    value={newItem.name} 
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    placeholder="e.g. Rent"
                 />
              </div>
              <div className="space-y-2 w-[150px]">
                 <label className="text-xs font-medium">Category</label>
                 <Select value={newItem.category} onValueChange={(v) => setNewItem({...newItem, category: v as Category})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                       <SelectItem value="Needs">Needs</SelectItem>
                       <SelectItem value="Wants">Wants</SelectItem>
                       <SelectItem value="Savings-Debt">Savings</SelectItem>
                    </SelectContent>
                 </Select>
              </div>
              <div className="space-y-2 w-[120px]">
                 <label className="text-xs font-medium">Amount</label>
                 <Input 
                    type="number"
                    value={newItem.amount} 
                    onChange={(e) => setNewItem({...newItem, amount: e.target.value})}
                    placeholder="0.00"
                 />
              </div>
              <Button onClick={handleAdd} disabled={!newItem.name || !newItem.amount}>
                 <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
           </div>
        </div>
      )}
    </div>
  );
}
