import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  Key,
  Eye,
  EyeOff,
  UserPlus,
  Plus,
  Copy,
  CheckCircle,
  Mail,
  Shield,
  Users,
} from "lucide-react";
import {
  createPartnerUserFormSchema,
  generateLicensesSchema,
} from "@shared/schema";
import type { Partner, PartnerUser } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "@/components/layout/admin-layout";
import { StatsCard } from "@/components/shared/stats-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
} from "@/components/ui/form";
import { TIER_LABELS, MAX_BATCH_SIZE } from "@/lib/constants";
import type { z } from "zod";

type CreateUserValues = z.infer<typeof createPartnerUserFormSchema>;
type GenerateKeysValues = z.infer<typeof generateLicensesSchema>;

interface PartnerStats {
  totalGenerated: number;
  totalConsumed: number;
  totalRedeemed: number;
  totalAvailable: number;
  totalDeactivated: number;
  totalUpgraded: number;
}

interface PartnerDetail {
  partner: Partner;
  stats: PartnerStats;
}

function SecretField({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  const [visible, setVisible] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value);
      toast({ title: `${label} copied to clipboard` });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 rounded-md bg-muted px-2 py-1 text-xs font-mono break-all"
          data-testid={testId}
        >
          {value ? (visible ? value : "••••••••••••••••") : "Not set"}
        </code>
        {value && (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setVisible(!visible)}
              data-testid={`${testId}-toggle`}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopy}
              data-testid={`${testId}-copy`}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AddUserDialog({ partnerId }: { partnerId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createPartnerUserFormSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "viewer",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateUserValues) =>
      apiRequest("POST", `/api/admin/partners/${partnerId}/users`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId, "users"] });
      toast({ title: "User added successfully" });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add user", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-add-user">
          <UserPlus className="h-4 w-4" />
          <span>Add User</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Partner User</DialogTitle>
          <DialogDescription>Create a new user account for this partner.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="user@partner.com" data-testid="input-user-email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" data-testid="input-user-name" {...field} />
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
                    <Input type="password" placeholder="Min. 6 characters" data-testid="input-user-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-user-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-user">
                {createMutation.isPending ? "Adding..." : "Add User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateKeysDialog({ partnerId }: { partnerId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<GenerateKeysValues>({
    resolver: zodResolver(generateLicensesSchema),
    defaultValues: {
      tier: 1,
      quantity: 10,
      notes: "",
    },
  });

  const generateMutation = useMutation({
    mutationFn: (data: GenerateKeysValues) =>
      apiRequest("POST", "/api/admin/licenses/generate", { ...data, partnerId }),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: `${result.quantity ?? "Keys"} license keys generated` });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate keys", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-generate-keys">
          <Plus className="h-4 w-4" />
          <span>Generate Keys</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate License Keys</DialogTitle>
          <DialogDescription>Generate new license keys for this partner.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => generateMutation.mutate(data))} className="flex flex-col gap-4">
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
                  <FormLabel>Quantity (1-{MAX_BATCH_SIZE})</FormLabel>
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
                    <Input placeholder="Batch description" data-testid="input-notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={generateMutation.isPending} data-testid="button-submit-generate">
                {generateMutation.isPending ? "Generating..." : "Generate Keys"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPartnerDetail() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/admin/partners/:id");
  const partnerId = params?.id ? Number(params.id) : 0;

  const { data, isLoading: partnerLoading } = useQuery<PartnerDetail>({
    queryKey: ["/api/admin/partners", partnerId],
    enabled: !!partnerId,
  });

  const { data: users, isLoading: usersLoading } = useQuery<PartnerUser[]>({
    queryKey: ["/api/admin/partners", partnerId, "users"],
    enabled: !!partnerId,
  });

  const partner = data?.partner;
  const stats = data?.stats;

  if (!match) return null;

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/partners")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            {partnerLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <>
                <h1 className="text-2xl font-semibold" data-testid="text-partner-name">
                  {partner?.displayName || partner?.name}
                </h1>
                <p className="text-sm text-muted-foreground">{partner?.name}</p>
              </>
            )}
          </div>
          {partnerId > 0 && <GenerateKeysDialog partnerId={partnerId} />}
        </div>

        {partnerLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatsCard label="Generated" value={stats.totalGenerated} icon={Key} data-testid="stat-generated" />
            <StatsCard label="Consumed" value={stats.totalConsumed} icon={Key} data-testid="stat-consumed" />
            <StatsCard label="Redeemed" value={stats.totalRedeemed} icon={CheckCircle} data-testid="stat-redeemed" />
            <StatsCard label="Available" value={stats.totalAvailable} icon={Key} data-testid="stat-available" />
            <StatsCard label="Deactivated" value={stats.totalDeactivated} icon={Key} data-testid="stat-deactivated" />
            <StatsCard label="Upgraded" value={stats.totalUpgraded} icon={Key} data-testid="stat-upgraded" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Partner Information</CardTitle>
            </CardHeader>
            <CardContent>
              {partnerLoading ? (
                <div className="flex flex-col gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : partner ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <Badge
                      variant={partner.isActive ? "default" : "secondary"}
                      className="w-fit no-default-hover-elevate"
                      data-testid="badge-partner-active"
                    >
                      {partner.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {partner.contactEmail && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Contact Email</span>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm" data-testid="text-contact-email">{partner.contactEmail}</span>
                      </div>
                    </div>
                  )}
                  <Separator />
                  <SecretField label="API Key" value={partner.apiKey} testId="text-api-key" />
                  <SecretField label="Webhook Secret" value={partner.webhookSecret} testId="text-webhook-secret" />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">Partner Users</CardTitle>
              {partnerId > 0 && <AddUserDialog partnerId={partnerId} />}
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : users && users.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between gap-4 rounded-md bg-muted p-3"
                      data-testid={`user-row-${user.id}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium" data-testid={`text-user-name-${user.id}`}>
                          {user.name || user.email}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                          {user.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="no-default-hover-elevate text-xs" data-testid={`badge-user-role-${user.id}`}>
                          {user.role}
                        </Badge>
                        {user.isAdmin && (
                          <Badge variant="outline" className="no-default-hover-elevate text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        )}
                        <Badge
                          variant={user.isActive ? "default" : "secondary"}
                          className="no-default-hover-elevate text-xs"
                          data-testid={`badge-user-status-${user.id}`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <Users className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No users yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
