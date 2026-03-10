import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Users, Plus, Mail } from "lucide-react";
import { createPartnerFormSchema } from "@shared/schema";
import type { Partner } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "@/components/layout/admin-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { z } from "zod";

type CreatePartnerValues = z.infer<typeof createPartnerFormSchema>;

export default function AdminPartners() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: partners, isLoading } = useQuery<Partner[]>({
    queryKey: ["/api/admin/partners"],
  });

  const form = useForm<CreatePartnerValues>({
    resolver: zodResolver(createPartnerFormSchema),
    defaultValues: {
      name: "",
      displayName: "",
      contactEmail: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePartnerValues) =>
      apiRequest("POST", "/api/admin/partners", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Partner created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create partner", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: CreatePartnerValues) => {
    createMutation.mutate(data);
  };

  const columns: DataTableColumn<Partner>[] = [
    {
      key: "name",
      header: "Partner",
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium" data-testid={`text-partner-name-${row.id}`}>
            {row.displayName || row.name}
          </span>
          <span className="text-xs text-muted-foreground">{row.name}</span>
        </div>
      ),
    },
    {
      key: "contactEmail",
      header: "Contact",
      render: (row) => (
        <span className="text-sm text-muted-foreground" data-testid={`text-partner-email-${row.id}`}>
          {row.contactEmail || "—"}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      render: (row) => (
        <StatusBadge
          status={row.isActive ? "redeemed" : "deactivated"}
          data-testid={`badge-partner-status-${row.id}`}
        />
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Partners</h1>
            <p className="text-sm text-muted-foreground">Manage partner organizations</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-partner">
                <Plus className="h-4 w-4" />
                <span>Create Partner</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Partner</DialogTitle>
                <DialogDescription>Add a new partner organization to the system.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name (unique identifier)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="appsumo"
                            data-testid="input-partner-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="AppSumo"
                            data-testid="input-partner-display-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="contact@partner.com"
                            data-testid="input-partner-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      data-testid="button-submit-partner"
                    >
                      {createMutation.isPending ? "Creating..." : "Create Partner"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <DataTable
          columns={columns as DataTableColumn<Record<string, unknown>>[]}
          data={(partners ?? []) as unknown as Record<string, unknown>[]}
          isLoading={isLoading}
          emptyTitle="No partners"
          emptyDescription="Get started by creating a partner organization."
          emptyActionLabel="Create Partner"
          onEmptyAction={() => setDialogOpen(true)}
          onRowClick={(row) => navigate(`/admin/partners/${(row as unknown as Partner).id}`)}
          data-testid="table-partners"
        />
      </div>
    </AdminLayout>
  );
}
