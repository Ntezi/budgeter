import { useMemo, useRef } from "react";
import { Budget, PlanItem, Account, useApp } from "@/lib/store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";

interface ReconcileSectionProps {
  budget: Budget;
  onUpdate: (plan: PlanItem[]) => void;
}

const ItemType = 'PLAN_ITEM';

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const ReconcileRow = ({ 
  item, 
  index, 
  moveItem, 
  fundedAmount, 
  accounts, 
  onAccountChange 
}: { 
  item: PlanItem, 
  index: number, 
  moveItem: (dragIndex: number, hoverIndex: number) => void,
  fundedAmount: number,
  accounts: Account[],
  onAccountChange: (id: string, accountId: string) => void
}) => {
  const ref = useRef<HTMLTableRowElement>(null);
  
  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: string | symbol | null }>({
    accept: ItemType,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = (clientOffset as any).y - hoverBoundingRect.top;
      
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      
      moveItem(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: () => {
      return { id: item.id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  const isFullyFunded = fundedAmount >= item.amount;
  const isPartiallyFunded = fundedAmount > 0 && fundedAmount < item.amount;

  return (
    <TableRow 
      ref={ref} 
      data-handler-id={handlerId} 
      className={`${isDragging ? 'opacity-0' : 'opacity-100'} cursor-move`}
    >
      <TableCell className="w-[40px] text-center">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      <TableCell className="font-medium">
        {index + 1}
      </TableCell>
      <TableCell>
         <div className="font-medium">{item.name}</div>
         <div className="text-xs text-muted-foreground">{item.category}</div>
      </TableCell>
      <TableCell className="text-right">
        ${item.amount.toLocaleString()}
      </TableCell>
      <TableCell className="text-right font-bold text-blue-600">
        ${fundedAmount.toLocaleString()}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        ${Math.max(0, item.amount - fundedAmount).toLocaleString()}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={isFullyFunded ? "default" : isPartiallyFunded ? "secondary" : "destructive"}>
          {isFullyFunded ? "Funded" : isPartiallyFunded ? "Partial" : "Unfunded"}
        </Badge>
      </TableCell>
      <TableCell>
         <Select value={item.accountId || "unassigned"} onValueChange={(v) => onAccountChange(item.id, v === "unassigned" ? "" : v)}>
            <SelectTrigger className="h-8 w-[140px]">
               <SelectValue placeholder="Select Account" />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value="unassigned">Unassigned</SelectItem>
               {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name} (${acc.balance})</SelectItem>
               ))}
            </SelectContent>
         </Select>
      </TableCell>
    </TableRow>
  );
};

export function ReconcileSection({ budget, onUpdate }: ReconcileSectionProps) {
  const { accounts } = useApp();
  
  // Sort items by priority
  const sortedPlan = useMemo(() => {
     return [...budget.plan].sort((a, b) => a.priority - b.priority);
  }, [budget.plan]);
  
  const totalIncome = budget.income.reduce((sum, i) => sum + i.amount, 0);
  
  // Calculate funding
  let remainingIncome = totalIncome;
  const planWithFunding = sortedPlan.map(item => {
     const funded = Math.min(item.amount, remainingIncome);
     remainingIncome = Math.max(0, remainingIncome - funded);
     return { ...item, funded };
  });

  const moveItem = (dragIndex: number, hoverIndex: number) => {
     const newPlan = [...sortedPlan];
     const [reorderedItem] = newPlan.splice(dragIndex, 1);
     newPlan.splice(hoverIndex, 0, reorderedItem);
     
     // Update priorities
     const updatedPlan = newPlan.map((item, idx) => ({
        ...item,
        priority: idx + 1
     }));
     
     onUpdate(updatedPlan);
  };
  
  const handleAccountChange = (itemId: string, accountId: string) => {
     const updatedPlan = budget.plan.map(item => item.id === itemId ? { ...item, accountId } : item);
     onUpdate(updatedPlan);
  };

  return (
    <div className="space-y-6">
       {/* Summary Header */}
       <div className="grid grid-cols-4 gap-4 p-4 bg-muted/20 rounded-lg border">
          <div>
             <div className="text-xs text-muted-foreground uppercase font-bold">Total Income</div>
             <div className="text-xl font-bold">${totalIncome.toLocaleString()}</div>
          </div>
          <div>
             <div className="text-xs text-muted-foreground uppercase font-bold">Allocated</div>
             <div className="text-xl font-bold text-blue-600">${(totalIncome - remainingIncome).toLocaleString()}</div>
          </div>
          <div>
             <div className="text-xs text-muted-foreground uppercase font-bold">Remaining</div>
             <div className={`text-xl font-bold ${remainingIncome > 0 ? "text-green-600" : "text-gray-500"}`}>
                ${remainingIncome.toLocaleString()}
             </div>
          </div>
          <div>
             <div className="text-xs text-muted-foreground uppercase font-bold">Unfunded Plan</div>
             <div className="text-xl font-bold text-red-500">
                ${planWithFunding.reduce((sum, item) => sum + (item.amount - item.funded), 0).toLocaleString()}
             </div>
          </div>
       </div>
       
       <p className="text-sm text-muted-foreground">
          Drag items to reorder priority. Funds are allocated from top to bottom.
       </p>

       <div className="rounded-md border bg-card">
          <Table>
             <TableHeader>
                <TableRow>
                   <TableHead className="w-[40px]"></TableHead>
                   <TableHead className="w-[50px]">#</TableHead>
                   <TableHead>Item</TableHead>
                   <TableHead className="text-right">Planned</TableHead>
                   <TableHead className="text-right">Funded</TableHead>
                   <TableHead className="text-right">Unfunded</TableHead>
                   <TableHead className="text-center">Status</TableHead>
                   <TableHead>Account</TableHead>
                </TableRow>
             </TableHeader>
             <TableBody>
                {planWithFunding.map((item, index) => (
                   <ReconcileRow 
                      key={item.id} 
                      item={item} 
                      index={index} 
                      moveItem={moveItem}
                      fundedAmount={item.funded}
                      accounts={accounts}
                      onAccountChange={handleAccountChange}
                   />
                ))}
             </TableBody>
          </Table>
       </div>
    </div>
  );
}
