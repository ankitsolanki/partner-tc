import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { loginSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { z } from "zod";

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginFormValues) =>
      apiRequest("POST", "/api/admin/auth/login", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auth/me"] });
      navigate("/admin/dashboard");
    },
    onError: (error: Error) => {
      setServerError(error.message.includes("401") ? "Invalid email or password" : "Login failed. Please try again.");
    },
  });

  if (authLoading) {
    return null;
  }

  if (isAuthenticated) {
    setTimeout(() => navigate("/admin/dashboard"), 0);
    return null;
  }

  const onSubmit = (data: LoginFormValues) => {
    setServerError(null);
    loginMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center rounded-md bg-muted p-3">
              <Shield className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl" data-testid="text-admin-login-title">Admin Portal</CardTitle>
          <CardDescription>
            <Badge variant="secondary" className="no-default-hover-elevate mt-1">
              Admin Access
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="admin@example.com"
                        data-testid="input-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        data-testid="input-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError && (
                <p className="text-sm text-destructive" data-testid="text-login-error">
                  {serverError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
