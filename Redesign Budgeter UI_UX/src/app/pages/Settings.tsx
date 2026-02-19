import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

export function Settings() {
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();

  const handleSignOut = () => {
    // In real app, call supabase.auth.signOut()
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  return (
    <div className="space-y-6">
       <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences.</p>
       </div>

       <Card>
          <CardHeader>
             <CardTitle>Profile</CardTitle>
             <CardDescription>Your personal information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                   <AvatarImage src="https://github.com/shadcn.png" />
                   <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div>
                   <h3 className="text-lg font-medium">John Doe</h3>
                   <p className="text-sm text-muted-foreground">john.doe@example.com</p>
                </div>
             </div>
             
             <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
             </Button>
          </CardContent>
       </Card>

       <Card>
          <CardHeader>
             <CardTitle>Appearance</CardTitle>
             <CardDescription>Customize the look and feel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
                <div className="space-y-1">
                   <p className="font-medium">Theme</p>
                   <p className="text-sm text-muted-foreground">Select your preferred color scheme.</p>
                </div>
                <div className="flex gap-2">
                   <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')}>
                      <Sun className="mr-2 h-4 w-4" /> Light
                   </Button>
                   <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')}>
                      <Moon className="mr-2 h-4 w-4" /> Dark
                   </Button>
                </div>
             </div>
          </CardContent>
       </Card>
    </div>
  );
}
