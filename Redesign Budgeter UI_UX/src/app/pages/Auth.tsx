import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chrome } from "lucide-react";

export function Auth() {
  const navigate = useNavigate();

  const handleLogin = () => {
    // In a real app, this would trigger Supabase auth.
    // For now, we simulate a successful login.
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-2">
            <span className="text-primary-foreground font-bold text-xl">B</span>
          </div>
          <CardTitle className="text-2xl font-bold">Sign in to Budgeter</CardTitle>
          <CardDescription>
            Welcome back! Please sign in to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            variant="outline" 
            className="w-full h-12 text-base font-medium relative" 
            onClick={handleLogin}
          >
            <Chrome className="mr-2 h-5 w-5 absolute left-4" />
            Continue with Google
          </Button>
          <p className="text-xs text-center text-muted-foreground px-4">
            By clicking continue, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
