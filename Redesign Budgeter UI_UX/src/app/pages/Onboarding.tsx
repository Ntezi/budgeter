import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, PiggyBank, Target, Wallet } from "lucide-react";

const STEPS = [
  {
    title: "Welcome to Budgeter",
    description: "Plan your money month-by-month with clarity and confidence.",
    icon: Wallet,
    color: "bg-blue-100 text-blue-600",
  },
  {
    title: "Needs, Wants, Savings",
    description: "Categorize every dollar. We help you balance your spending.",
    icon: PiggyBank,
    color: "bg-pink-100 text-pink-600",
  },
  {
    title: "Auto vs Manual Plans",
    description: "Use the 50/30/20 rule automatically, or set your own custom targets.",
    icon: Target,
    color: "bg-green-100 text-green-600",
  },
];

export function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-0 bg-card/50 backdrop-blur-xl">
        <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
          
          {/* Progress Indicators */}
          <div className="flex gap-2 mb-4">
            {STEPS.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1.5 w-8 rounded-full transition-all duration-300",
                  index === currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Icon */}
          <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center mb-4 transition-all duration-500", STEPS[currentStep].color)}>
            {(() => {
              const Icon = STEPS[currentStep].icon;
              return <Icon className="w-10 h-10" />;
            })()}
          </div>

          {/* Text Content */}
          <div className="space-y-2 min-h-[100px]">
            <h1 className="text-2xl font-bold tracking-tight">
              {STEPS[currentStep].title}
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {STEPS[currentStep].description}
            </p>
          </div>

          {/* Action Button */}
          <Button 
            size="lg" 
            className="w-full mt-8 text-base font-semibold group" 
            onClick={handleNext}
          >
            {currentStep === STEPS.length - 1 ? "Get Started" : "Next"}
            <ArrowRight className={cn("ml-2 w-4 h-4 transition-transform group-hover:translate-x-1", 
              currentStep === STEPS.length - 1 ? "hidden" : "block"
            )} />
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}
