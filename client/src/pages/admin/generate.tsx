import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { CheckCircle, Key, AlertTriangle } from "lucide-react";
import { generateLicensesSchema } from "@shared/schema";
import type { Partner } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { TIER_LABELS, MAX_BATCH_SIZE } from "@/lib/constants";
import { z } from "zod";

const adminGenerateSchema = generateLicensesSchema.extend({
  partnerId: z.number().int().min(1, "Please select a partner"),
});

type GenerateValues = z.infer<typeof adminGenerateSchema>;

interface GenerateResult {
  batchId: string;
  quantity: number;
  tier: number;
  partnerId: number;
}

export default function AdminGenerate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [result, setResult] = useState<GenerateResult | null>(null);

  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/admin/partners"],
  });

  const form = useForm<GenerateValues>({
    resolver: zodResolver(adminGenerateSchema),
    defaultValues: {
      partnerId: 0,
      tier: 1,
      quantity: 10,
      notes: "",
    },
  });

  const generateMutation = useMutation({
    mutationFn: (data: GenerateValues) =>
      apiRequest("POST", "/api/admin/licenses/generate", data),
    onSuccess: async (res) => {
      const data = await res.json();
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: `${data.quantity} license keys generated` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate keys", description: error.message, variant: "destructive" });
    },
  });

  if (result) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
              <div className="flex items-center justify-center rounded-md bg-green-100 dark:bg-green-900/30 p-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold" data-testid="text-success-title">Keys Generated</h2>
                <p className="text-sm text-muted-foreground" data-testid="text-success-description">
                  Successfully generated {result.quantity} {TIER_LABELS[result.tier]} license keys.
                </p>
                <p className="text-xs text-muted-foreground">
                  Batch ID: {result.batchId}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/admin/partners/${result.partnerId}`)}
                  data-testid="button-view-partner"
                >
                  View Partner
                </Button>
                <Button
                  onClick={() => {
                    setResult(null);
                    form.reset();
                  }}
                  data-testid="button-generate-more"
                >
                  Generate More
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Generate License Keys</h1>
          <p className="text-sm text-muted-foreground">Generate license keys for any partner</p>
        </div>

        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-lg">Key Generation</CardTitle>
            <CardDescription>Select a partner and configure the batch.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => generateMutation.mutate(data))} className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="partnerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partner</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(Number(val))}
                        value={field.value ? String(field.value) : ""}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-partner">
                            <SelectValue placeholder="Select a partner" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(partners ?? []).map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.displayName || p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tier</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(Number(val))}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-tier">
                            <SelectValue placeholder="Select tier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">{TIER_LABELS[1]}</SelectItem>
                          <SelectItem value="2">{TIER_LABELS[2]}</SelectItem>
                          <SelectItem value="3">{TIER_LABELS[3]}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_BATCH_SIZE}
                          data-testid="input-quantity"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Between 1 and {MAX_BATCH_SIZE.toLocaleString()} keys</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Batch description or notes"
                          className="resize-none"
                          data-testid="input-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-start gap-2 rounded-md bg-muted p-3">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Keys cannot be deleted once generated. Double-check the tier and quantity before submitting.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={generateMutation.isPending}
                  data-testid="button-submit-generate"
                >
                  {generateMutation.isPending ? "Generating..." : "Generate Keys"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
