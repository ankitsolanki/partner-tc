import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PartnerLayout } from "@/components/layout/partner-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { TIER_LABELS, MAX_BATCH_SIZE } from "@/lib/constants";
import { Loader2, CheckCircle, Download, Eye, AlertTriangle } from "lucide-react";

const generateFormSchema = z.object({
  tier: z.string().min(1, "Please select a tier"),
  quantity: z.string().min(1, "Quantity is required").refine(
    (val) => {
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 1 && num <= MAX_BATCH_SIZE;
    },
    { message: `Quantity must be between 1 and ${MAX_BATCH_SIZE}` }
  ),
  notes: z.string().optional(),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

interface GenerateResult {
  batchId: string;
  tier: number;
  quantity: number;
}

export default function PartnerGenerate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [result, setResult] = useState<GenerateResult | null>(null);

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: { tier: "", quantity: "", notes: "" },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: GenerateFormValues) => {
      const res = await apiRequest("POST", "/api/partner/licenses/generate", {
        tier: parseInt(data.tier, 10),
        quantity: parseInt(data.quantity, 10),
        notes: data.notes || undefined,
      });
      return res.json();
    },
    onSuccess: (data: GenerateResult) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/partner/licenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/licenses/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/batches"] });
      toast({ title: "Keys generated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GenerateFormValues) => {
    generateMutation.mutate(data);
  };

  const handleExportBatch = () => {
    if (!result) return;
    window.open(`/api/partner/batches/${result.batchId}/export`, "_blank");
  };

  if (result) {
    return (
      <PartnerLayout>
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <div className="flex items-center justify-center rounded-full bg-green-100 p-3 dark:bg-green-900/30">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold" data-testid="text-success-title">
              Keys Generated Successfully
            </h2>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="text-success-summary">
              {result.quantity} {TIER_LABELS[result.tier]} keys have been generated
            </p>
            <p className="mt-1 text-xs font-mono text-muted-foreground" data-testid="text-batch-id">
              Batch: {result.batchId}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={handleExportBatch}
              data-testid="button-export-batch"
            >
              <Download className="h-4 w-4" />
              Export Keys
            </Button>
            <Button
              onClick={() => navigate("/partner/licenses")}
              data-testid="button-view-licenses"
            >
              <Eye className="h-4 w-4" />
              View Licenses
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              form.reset();
            }}
            data-testid="button-generate-more"
          >
            Generate More Keys
          </Button>
        </div>
      </PartnerLayout>
    );
  }

  return (
    <PartnerLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Generate Keys
          </h1>
          <p className="text-sm text-muted-foreground">
            Create new license keys for distribution
          </p>
        </div>

        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Key Batch</CardTitle>
              <CardDescription>
                Configure the details for your new batch of license keys
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="tier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tier</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tier">
                              <SelectValue placeholder="Select a tier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(TIER_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v}
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
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={MAX_BATCH_SIZE}
                            placeholder="Number of keys to generate"
                            data-testid="input-quantity"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum {MAX_BATCH_SIZE.toLocaleString()} keys per batch
                        </FormDescription>
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
                            placeholder="Add any notes about this batch..."
                            className="resize-none"
                            data-testid="input-notes"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      Keys cannot be deleted once generated
                    </span>
                  </div>

                  <Button
                    type="submit"
                    disabled={generateMutation.isPending}
                    data-testid="button-generate"
                  >
                    {generateMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Generate Keys
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </PartnerLayout>
  );
}
