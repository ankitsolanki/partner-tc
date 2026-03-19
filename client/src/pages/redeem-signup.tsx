import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  UserPlus,
  LayoutDashboard,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Mail,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { TIER_LABELS } from "@/lib/constants";
import { redeemSignupSchema } from "@shared/schema";

type FormValues = z.infer<typeof redeemSignupSchema>;

interface LicenseInfo {
  tier: number;
  status: string;
  partnerName: string;
}

const PROVISIONING_PHASES = [
  { label: "Creating your account...", icon: UserPlus },
  { label: "Setting up your workspace...", icon: LayoutDashboard },
  { label: "Activating your plan...", icon: Sparkles },
  { label: "Finalizing...", icon: CheckCircle2 },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RedeemSignup() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<"loading" | "form" | "provisioning" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(0);

  // Fetch license info from session
  const {
    data: licenseInfo,
    error: licenseError,
    isLoading: licenseLoading,
  } = useQuery<LicenseInfo>({
    queryKey: ["/api/redeem/license-info"],
    queryFn: getQueryFn({ on401: "throw" }),
    retry: false,
  });

  // Set phase based on license query result
  useEffect(() => {
    if (licenseLoading) return;
    if (licenseInfo) {
      setPhase("form");
    } else if (licenseError) {
      setPhase("error");
      const msg = licenseError.message || "";
      if (msg.includes("409")) {
        setErrorMessage("This license has already been redeemed. If you believe this is an error, please contact support.");
      } else if (msg.includes("400")) {
        setErrorMessage("No pending license key found. Please start the activation process from AppSumo.");
      } else if (msg.includes("404")) {
        setErrorMessage("License key not found. Please contact support.");
      } else {
        setErrorMessage("Something went wrong. Please try again or contact support.");
      }
    }
  }, [licenseInfo, licenseError, licenseLoading]);

  // Provisioning phase animation
  useEffect(() => {
    if (phase !== "provisioning") return;
    if (currentStep >= PROVISIONING_PHASES.length - 1) return;

    const timer = setTimeout(() => {
      setCurrentStep((s) => Math.min(s + 1, PROVISIONING_PHASES.length - 1));
    }, 1500);

    return () => clearTimeout(timer);
  }, [phase, currentStep]);

  // Form
  const form = useForm<FormValues>({
    resolver: zodResolver(redeemSignupSchema),
    defaultValues: { email: "", firstName: "", lastName: "" },
  });

  // Signup mutation
  const signupMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/redeem/signup", data);
      return res.json();
    },
    onSuccess: (result: { name: string; email: string }) => {
      // Allow final animation step to show before navigating
      setCurrentStep(PROVISIONING_PHASES.length - 1);
      setTimeout(() => {
        const params = new URLSearchParams({
          name: result.name,
          email: result.email,
        });
        navigate(`/redeem/success?${params.toString()}`);
      }, 1200);
    },
    onError: (error: Error) => {
      setPhase("error");
      setErrorMessage(error.message || "Account provisioning failed. Please try again.");
    },
  });

  const onSubmit = (data: FormValues) => {
    setPhase("provisioning");
    setCurrentStep(0);
    signupMutation.mutate(data);
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}
    >
      {/* Radial glow */}
      <div
        aria-hidden="true"
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Main card */}
      <div
        className="relative z-10 w-full max-w-md px-8 py-10 rounded-3xl"
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
          animation: "cardIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
        }}
      >
        {phase === "loading" && <LoadingState />}
        {phase === "form" && licenseInfo && (
          <FormState
            licenseInfo={licenseInfo}
            form={form}
            onSubmit={onSubmit}
            isPending={signupMutation.isPending}
          />
        )}
        {phase === "provisioning" && (
          <ProvisioningState currentStep={currentStep} />
        )}
        {phase === "error" && (
          <ErrorState
            message={errorMessage}
            onRetry={() => {
              setPhase("form");
              setErrorMessage("");
            }}
            showRetry={!!licenseInfo}
          />
        )}
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes stepIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Loading State ────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2
        className="h-8 w-8 text-indigo-400"
        style={{ animation: "spin 1s linear infinite" }}
      />
      <p className="mt-4 text-sm" style={{ color: "rgba(196,181,253,0.6)" }}>
        Loading license information...
      </p>
    </div>
  );
}

// ─── Form State ───────────────────────────────────────────────────────────────
function FormState({
  licenseInfo,
  form,
  onSubmit,
  isPending,
}: {
  licenseInfo: LicenseInfo;
  form: ReturnType<typeof useForm<FormValues>>;
  onSubmit: (data: FormValues) => void;
  isPending: boolean;
}) {
  const tierLabel = TIER_LABELS[licenseInfo.tier] || `Tier ${licenseInfo.tier}`;

  return (
    <>
      {/* Header */}
      <div className="text-center mb-8" style={{ animation: "fadeUp 0.5s ease both" }}>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))",
          border: "1px solid rgba(99,102,241,0.3)",
        }}>
          <Sparkles className="h-8 w-8 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Activate Your License
        </h1>
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{
            background: "rgba(99,102,241,0.15)",
            color: "rgba(165,148,249,0.9)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          {licenseInfo.partnerName} &middot; {tierLabel}
        </div>
      </div>

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div
            className="space-y-4"
            style={{ animation: "fadeUp 0.5s 0.15s ease both" }}
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium" style={{ color: "rgba(196,181,253,0.7)" }}>
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      className="h-11 rounded-xl border-0 text-white placeholder:text-gray-500"
                      style={{
                        background: "rgba(255,255,255,0.07)",
                      }}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium" style={{ color: "rgba(196,181,253,0.7)" }}>
                      First name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Jane"
                        className="h-11 rounded-xl border-0 text-white placeholder:text-gray-500"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium" style={{ color: "rgba(196,181,253,0.7)" }}>
                      Last name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Doe"
                        className="h-11 rounded-xl border-0 text-white placeholder:text-gray-500"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Submit */}
          <div style={{ animation: "fadeUp 0.5s 0.3s ease both" }}>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-12 rounded-xl font-semibold text-base gap-2 mt-2"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "white",
                border: "none",
                boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
              }}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5" style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <>
                  Create Account & Activate
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      {/* Footer */}
      <p
        className="text-center text-xs mt-6"
        style={{ color: "rgba(196,181,253,0.3)", animation: "fadeUp 0.5s 0.4s ease both" }}
      >
        By creating an account, you agree to our Terms of Service.
      </p>
    </>
  );
}

// ─── Provisioning State ──────────────────────────────────────────────────────
function ProvisioningState({ currentStep }: { currentStep: number }) {
  return (
    <div className="py-8">
      <div className="text-center mb-10" style={{ animation: "fadeUp 0.4s ease both" }}>
        <h2 className="text-xl font-bold text-white mb-2">Setting things up</h2>
        <p className="text-sm" style={{ color: "rgba(196,181,253,0.5)" }}>
          This will only take a moment...
        </p>
      </div>

      <div className="space-y-5">
        {PROVISIONING_PHASES.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;

          return (
            <div
              key={i}
              className="flex items-center gap-4"
              style={{
                animation: i <= currentStep ? `stepIn 0.4s ${i * 0.1}s ease both` : undefined,
                opacity: i > currentStep ? 0.2 : 1,
                transition: "opacity 0.3s ease",
              }}
            >
              <div
                className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: isDone
                    ? "rgba(52,211,153,0.15)"
                    : isActive
                      ? "rgba(99,102,241,0.2)"
                      : "rgba(255,255,255,0.05)",
                  border: `1px solid ${
                    isDone
                      ? "rgba(52,211,153,0.3)"
                      : isActive
                        ? "rgba(99,102,241,0.3)"
                        : "rgba(255,255,255,0.05)"
                  }`,
                  animation: isActive ? "pulse 1.5s ease-in-out infinite" : undefined,
                }}
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <Icon
                    className="h-5 w-5"
                    style={{
                      color: isActive ? "#818cf8" : "rgba(196,181,253,0.3)",
                    }}
                  />
                )}
              </div>
              <span
                className="text-sm font-medium"
                style={{
                  color: isDone
                    ? "rgba(52,211,153,0.9)"
                    : isActive
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(196,181,253,0.3)",
                }}
              >
                {isDone ? step.label.replace("...", "") + "Done!" : step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-8">
        <div
          className="h-1 w-full rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${((currentStep + 1) / PROVISIONING_PHASES.length) * 100}%`,
              background: "linear-gradient(90deg, #6366f1, #34d399)",
              transition: "width 0.6s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────
function ErrorState({
  message,
  onRetry,
  showRetry,
}: {
  message: string;
  onRetry: () => void;
  showRetry: boolean;
}) {
  return (
    <div className="text-center py-8" style={{ animation: "fadeUp 0.4s ease both" }}>
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
        style={{
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>

      <h2 className="text-xl font-bold text-white mb-3">Something went wrong</h2>
      <p className="text-sm mb-8 leading-relaxed" style={{ color: "rgba(196,181,253,0.6)" }}>
        {message}
      </p>

      <div className="flex flex-col gap-3">
        {showRetry && (
          <Button
            onClick={onRetry}
            className="w-full h-11 rounded-xl font-semibold"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              border: "none",
            }}
          >
            Try Again
          </Button>
        )}
        <a
          href="mailto:support@tinycommand.com"
          className="inline-flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-xl"
          style={{
            color: "rgba(196,181,253,0.7)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Mail className="h-4 w-4" />
          Contact Support
        </a>
      </div>
    </div>
  );
}
