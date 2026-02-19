import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Repeat, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Category, useApp } from "@/lib/store";

interface RecurringTemplate {
  id: string;
  name: string;
  amount: number;
  type: 'Income' | 'Expense';
  category: Category | 'Income';
  active: boolean;
}

const MOCK_RECURRING: RecurringTemplate[] = [
  { id: '1', name: 'Rent', amount: 1200, type: 'Expense', category: 'Needs', active: true },
  { id: '2', name: 'Netflix', amount: 15, type: 'Expense', category: 'Wants', active: true },
  { id: '3', name: 'Salary', amount: 3200, type: 'Income', category: 'Income', active: true },
];

export function Recurring() {
  const { budgets } = useApp();
  const [templates, setTemplates] = useState<RecurringTemplate[]>(MOCK_RECURRING);
  const [newTemplate, setNewTemplate] = useState({ name: "", amount: "", category: "Needs" as Category | 'Income', type: "Expense" as 'Income' | 'Expense' });

  const handleAdd = () => {
    if (!newTemplate.name || !newTemplate.amount) return;
    const amount = parseFloat(newTemplate.amount);
    
    setTemplates([
       ...templates,
       { 
          id: Math.random().toString(36).substr(2, 9),
          name: newTemplate.name,
          amount,
          category: newTemplate.category,
          type: newTemplate.type,
          active: true
       }
    ]);
    setNewTemplate({ name: "", amount: "", category: "Needs", type: "Expense" });
    toast.success("Template added");
  };

  const handleGenerate = () => {
     // Mock generation
     toast.success("Generated items into current draft budget.");
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div>
             <h1 className="text-3xl font-bold tracking-tight">Recurring Items</h1>
             <p className="text-muted-foreground">Manage regular income and expenses.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Import CSV
             </Button>
             <Button onClick={handleGenerate}>
                <Repeat className="mr-2 h-4 w-4" /> Generate to Budget
             </Button>
          </div>
       </div>

       <Card>
          <CardHeader>
             <CardTitle>Active Templates</CardTitle>
             <CardDescription>These items will be used to populate new budgets.</CardDescription>
          </CardHeader>
          <CardContent>
             <Table>
                <TableHeader>
                   <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                   <TableRow className="bg-muted/50">
                      <TableCell>
                         <Input 
                            value={newTemplate.name} 
                            onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})} 
                            placeholder="New template..."
                            className="h-8"
                         />
                      </TableCell>
                      <TableCell>
                         <Select value={newTemplate.type} onValueChange={(v) => setNewTemplate({...newTemplate, type: v as 'Income' | 'Expense'})}>
                            <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                               <SelectItem value="Income">Income</SelectItem>
                               <SelectItem value="Expense">Expense</SelectItem>
                            </SelectContent>
                         </Select>
                      </TableCell>
                      <TableCell>
                         <Select value={newTemplate.category} onValueChange={(v) => setNewTemplate({...newTemplate, category: v as Category | 'Income'})}>
                            <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
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
                            value={newTemplate.amount} 
                            onChange={(e) => setNewTemplate({...newTemplate, amount: e.target.value})} 
                            className="h-8 text-right"
                            placeholder="0.00"
                         />
                      </TableCell>
                      <TableCell className="text-center">
                         <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-200">Active</Badge>
                      </TableCell>
                      <TableCell>
                         <Button variant="ghost" size="icon" onClick={handleAdd}>
                            <Plus className="h-4 w-4" />
                         </Button>
                      </TableCell>
                   </TableRow>

                   {templates.map(t => (
                      <TableRow key={t.id}>
                         <TableCell className="font-medium">{t.name}</TableCell>
                         <TableCell>{t.type}</TableCell>
                         <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                         <TableCell className="text-right">${t.amount.toLocaleString()}</TableCell>
                         <TableCell className="text-center">
                            <Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Active" : "Paused"}</Badge>
                         </TableCell>
                         <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => setTemplates(templates.filter(x => x.id !== t.id))}>
                               <Trash2 className="h-4 w-4 text-destructive/50 hover:text-destructive" />
                            </Button>
                         </TableCell>
                      </TableRow>
                   ))}
                </TableBody>
             </Table>
          </CardContent>
       </Card>
    </div>
  );
}
