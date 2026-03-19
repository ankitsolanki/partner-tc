import { useState, useEffect, useId } from "react";
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
  Eye,
  EyeOff,
  Shield,
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

// ─── Brand Constants ──────────────────────────────────────────────────────────
const TC_LOGO = "https://cdn-v1.tinycommand.com/1234567890/1771243665296/tinybox%20logo%20%281%29.png";

// Product icon SVGs sourced from app-landing/src/lib/brand-icons.tsx
function ProductIcon({ type, size = 32 }: { type: string; size?: number }) {
  const id = `${type}-${Math.random().toString(36).slice(2, 6)}`;
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 100 100", fill: "none", xmlns: "http://www.w3.org/2000/svg" };

  switch (type) {
    case "form":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="50" fill={`url(#${id})`}/>
          <path d="M47.4063 72.4868H31.4746V43.4302L31.5678 43.3254L40.6283 32.4947L43.8892 28.6049L44.8092 27.4985H68.532V43.4419H47.3948V72.4985L47.4063 72.4868Z" fill="white"/>
          <path d="M68.0947 51.1323H53.7119V65.5151H68.0947V51.1323Z" fill="white"/>
          <defs><linearGradient id={id} x1="93.6" y1="0.3" x2="-9.2" y2="117.5" gradientUnits="userSpaceOnUse"><stop stopColor="#FFBA08"/><stop offset="1" stopColor="#FF7B52"/></linearGradient></defs>
        </svg>
      );
    case "workflow":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="50" fill={`url(#${id})`}/>
          <path d="M62.7094 60.5243V72.4895H44.1949L29.7598 60.5243L29.5615 60.36V44.4517H44.1949V60.5243H62.7094Z" fill="white"/>
          <path d="M39.6133 39.4654V27.5H58.128L72.5628 39.4654L72.7613 39.6297V55.5379H58.128V39.4654H39.6133Z" fill="white"/>
          <defs><linearGradient id={id} x1="140" y1="-36" x2="4" y2="94" gradientUnits="userSpaceOnUse"><stop stopColor="#358CFF"/><stop offset="1" stopColor="#1C3693"/></linearGradient></defs>
        </svg>
      );
    case "table":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="50" fill={`url(#${id})`}/>
          <path d="M42.7064 43.8694H27.5V28.9639H45.1238L45.9815 29.9999L49.034 33.6427L57.5005 43.7692L57.5898 43.8694V71.0405H42.6952V43.8694H42.7064Z" fill="white"/>
          <path d="M72.5017 28.9639H57.6074V43.8583H72.5017V28.9639Z" fill="white"/>
          <defs><linearGradient id={id} x1="-12" y1="109" x2="104" y2="-1" gradientUnits="userSpaceOnUse"><stop stopColor="#369B7D"/><stop offset="1" stopColor="#4FDB95"/></linearGradient></defs>
        </svg>
      );
    case "email":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="50" fill={`url(#${id})`}/>
          <path d="M63.8447 39.2642H48.2471V39.2935L48.2549 39.3013H48.2471V60.6978H48.2461V60.7339H63.8447V72.4995H46.3389L36.499 60.7427V39.2563L36.5674 39.1782L46.3389 27.4995H63.8447V39.2642ZM48.2549 60.6978L48.2471 60.7065V60.6978H48.2549Z" fill="white"/>
          <path d="M63.5177 44.9443H52.9043V55.5578H63.5177V44.9443Z" fill="white"/>
          <defs><linearGradient id={id} x1="113" y1="-19" x2="-61" y2="155" gradientUnits="userSpaceOnUse"><stop stopColor="#EC3957"/><stop offset="1" stopColor="#FF7B52"/></linearGradient></defs>
        </svg>
      );
    case "agent":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="50" fill={`url(#${id})`}/>
          <path d="M74.999 27.5005V44.1147H74.8926L75.0029 44.2524V72.4995H61.7734V44.2524H38.9375V72.5005H25.0039V44.2524L38.9375 27.7368L39.1309 27.5005H74.999ZM57.626 65.5581H44.0342V51.9673H57.626V65.5581Z" fill="white"/>
          <defs><linearGradient id={id} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#8133F1"/><stop offset="1" stopColor="#360083"/></linearGradient></defs>
        </svg>
      );
    default:
      return null;
  }
}

const PRODUCTS = [
  { name: "Forms", desc: "Collect responses", type: "form" },
  { name: "Workflows", desc: "Automate tasks", type: "workflow" },
  { name: "Tables", desc: "Manage data", type: "table" },
  { name: "Email", desc: "Send campaigns", type: "email" },
  { name: "Agents", desc: "AI assistants", type: "agent" },
];

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

  console.log("[RedeemSignup] Component rendered. Current phase:", phase);

  const {
    data: licenseInfo,
    error: licenseError,
    isLoading: licenseLoading,
  } = useQuery<LicenseInfo>({
    queryKey: ["/api/redeem/license-info"],
    queryFn: async ({ queryKey }) => {
      console.log("[RedeemSignup] Fetching license info from:", queryKey[0]);
      const res = await fetch(queryKey[0] as string, { credentials: "include" });
      console.log("[RedeemSignup] License info response status:", res.status);
      if (!res.ok) {
        const text = await res.text();
        console.error("[RedeemSignup] License info error response:", text);
        throw new Error(`${res.status}: ${text}`);
      }
      const data = await res.json();
      console.log("[RedeemSignup] License info data:", JSON.stringify(data));
      return data;
    },
    retry: false,
  });

  useEffect(() => {
    if (licenseLoading) return;
    if (licenseInfo) {
      console.log("[RedeemSignup] Setting phase to FORM");
      setPhase("form");
    } else if (licenseError) {
      console.error("[RedeemSignup] Setting phase to ERROR:", licenseError.message);
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

  useEffect(() => {
    if (phase !== "provisioning") return;
    if (currentStep >= PROVISIONING_PHASES.length - 1) return;
    const timer = setTimeout(() => {
      setCurrentStep((s) => Math.min(s + 1, PROVISIONING_PHASES.length - 1));
    }, 1500);
    return () => clearTimeout(timer);
  }, [phase, currentStep]);

  const form = useForm<FormValues>({
    resolver: zodResolver(redeemSignupSchema),
    defaultValues: { email: "", firstName: "", lastName: "", password: "" },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      console.log("[RedeemSignup] Calling POST /api/redeem/signup");
      const res = await apiRequest("POST", "/api/redeem/signup", data);
      const result = await res.json();
      console.log("[RedeemSignup] Signup response:", JSON.stringify(result));
      return result;
    },
    onSuccess: (result: { name: string; email: string; isNewUser: boolean }) => {
      console.log("[RedeemSignup] Signup SUCCESS!", result);
      setCurrentStep(PROVISIONING_PHASES.length - 1);
      setTimeout(() => {
        const params = new URLSearchParams({
          name: result.name,
          email: result.email,
          isNewUser: String(result.isNewUser),
        });
        navigate(`/redeem/success?${params.toString()}`);
      }, 1200);
    },
    onError: (error: Error) => {
      console.error("[RedeemSignup] Signup FAILED:", error.message);
      setPhase("error");
      setErrorMessage(error.message || "Account provisioning failed. Please try again.");
    },
  });

  const onSubmit = (data: FormValues) => {
    console.log("[RedeemSignup] Form submitted");
    setPhase("provisioning");
    setCurrentStep(0);
    signupMutation.mutate(data);
  };

  return (
    <div className="tc-redeem-page">
      {/* Background layers */}
      <div className="tc-bg-grid" aria-hidden="true" />
      <div className="tc-bg-glow tc-bg-glow-1" aria-hidden="true" />
      <div className="tc-bg-glow tc-bg-glow-2" aria-hidden="true" />

      <div className="tc-redeem-container">
        {/* Left panel — branding */}
        <div className="tc-brand-panel">
          <div className="tc-brand-inner">
            <img src={TC_LOGO} alt="Tiny Command" className="tc-logo" />
            <h2 className="tc-brand-heading">
              Everything you need to<br />
              <span className="tc-brand-accent">build & automate.</span>
            </h2>
            <p className="tc-brand-sub">
              Your lifetime deal unlocks the full suite of tools.
            </p>

            {/* Product strip */}
            <div className="tc-products">
              {PRODUCTS.map((p) => (
                <div key={p.name} className="tc-product-chip">
                  <ProductIcon type={p.type} size={32} />
                  <div>
                    <span className="tc-product-name">{p.name}</span>
                    <span className="tc-product-desc">{p.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="tc-brand-footer">
              <Shield className="tc-shield-icon" />
              <span>Lifetime access. No recurring fees. Cancel-free forever.</span>
            </div>
          </div>
        </div>

        {/* Right panel — form / provisioning / error */}
        <div className="tc-form-panel">
          <div className="tc-form-card" style={{ animation: "tcCardIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards" }}>
            {phase === "loading" && <LoadingState />}
            {phase === "form" && licenseInfo && (
              <FormState
                licenseInfo={licenseInfo}
                form={form}
                onSubmit={onSubmit}
                isPending={signupMutation.isPending}
              />
            )}
            {phase === "provisioning" && <ProvisioningState currentStep={currentStep} />}
            {phase === "error" && (
              <ErrorState
                message={errorMessage}
                onRetry={() => { setPhase("form"); setErrorMessage(""); }}
                showRetry={!!licenseInfo}
              />
            )}
          </div>
        </div>
      </div>

      <style>{`
        /* ─── Layout ──────────────────────────────── */
        .tc-redeem-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: #060a18;
          font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .tc-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(28,54,147,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(28,54,147,0.06) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .tc-bg-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(100px);
        }
        .tc-bg-glow-1 {
          width: 600px; height: 600px;
          top: -10%; left: -10%;
          background: radial-gradient(circle, rgba(28,54,147,0.25), transparent 70%);
        }
        .tc-bg-glow-2 {
          width: 400px; height: 400px;
          bottom: -10%; right: -5%;
          background: radial-gradient(circle, rgba(53,140,255,0.12), transparent 70%);
        }

        .tc-redeem-container {
          position: relative;
          z-index: 1;
          display: flex;
          width: 100%;
          max-width: 960px;
          min-height: 580px;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(28,54,147,0.2);
          box-shadow: 0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(28,54,147,0.1);
        }

        /* ─── Brand panel (left) ─────────────────── */
        .tc-brand-panel {
          flex: 1;
          background: linear-gradient(160deg, #0c1633 0%, #1c3693 50%, #0e1a40 100%);
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .tc-brand-panel::after {
          content: '';
          position: absolute;
          top: 0; right: 0;
          width: 120px; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(6,10,24,0.3));
          pointer-events: none;
        }

        .tc-brand-inner {
          position: relative;
          z-index: 1;
        }

        .tc-logo {
          height: 36px;
          width: auto;
          margin-bottom: 32px;
          animation: tcFadeUp 0.5s ease both;
        }

        .tc-brand-heading {
          font-size: 26px;
          font-weight: 700;
          line-height: 1.25;
          color: #fff;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
          animation: tcFadeUp 0.5s 0.1s ease both;
        }
        .tc-brand-accent {
          background: linear-gradient(90deg, #358CFF, #4FDB95);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .tc-brand-sub {
          font-size: 14px;
          color: rgba(255,255,255,0.5);
          margin: 0 0 32px;
          line-height: 1.5;
          animation: tcFadeUp 0.5s 0.2s ease both;
        }

        /* ─── Products ───────────────────────────── */
        .tc-products {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 32px;
          animation: tcFadeUp 0.5s 0.3s ease both;
        }
        .tc-product-chip {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          transition: background 0.2s, border-color 0.2s;
        }
        .tc-product-chip:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.12);
        }
        .tc-product-chip svg {
          flex-shrink: 0;
        }
        .tc-product-name {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
        }
        .tc-product-desc {
          display: block;
          font-size: 11px;
          color: rgba(255,255,255,0.4);
        }

        .tc-brand-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.35);
          animation: tcFadeUp 0.5s 0.4s ease both;
        }
        .tc-shield-icon {
          width: 14px;
          height: 14px;
          color: #4FDB95;
          flex-shrink: 0;
        }

        /* ─── Form panel (right) ─────────────────── */
        .tc-form-panel {
          flex: 1;
          background: #0a0f1f;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .tc-form-card {
          width: 100%;
          max-width: 380px;
        }

        /* ─── Form styling ───────────────────────── */
        .tc-form-header {
          text-align: center;
          margin-bottom: 28px;
        }
        .tc-form-logo {
          height: 28px;
          margin-bottom: 20px;
          display: none; /* shown on mobile only */
        }
        .tc-form-title {
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        .tc-form-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 500;
          background: rgba(28,54,147,0.2);
          color: #6b93e0;
          border: 1px solid rgba(28,54,147,0.3);
        }

        .tc-form-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          margin-bottom: 6px;
        }

        .tc-input {
          height: 44px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08) !important;
          background: rgba(255,255,255,0.04) !important;
          color: #fff !important;
          font-size: 14px;
          transition: border-color 0.2s, background 0.2s;
        }
        .tc-input:focus {
          border-color: rgba(28,54,147,0.5) !important;
          background: rgba(255,255,255,0.06) !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(28,54,147,0.15);
        }
        .tc-input::placeholder {
          color: rgba(255,255,255,0.2);
        }

        .tc-submit-btn {
          width: 100%;
          height: 46px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #1c3693, #358CFF);
          color: #fff;
          box-shadow: 0 4px 20px rgba(28,54,147,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .tc-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(28,54,147,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .tc-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .tc-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .tc-form-terms {
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          margin-top: 20px;
        }
        .tc-form-terms a {
          color: rgba(255,255,255,0.35);
          text-decoration: underline;
        }

        /* ─── Provisioning ───────────────────────── */
        .tc-prov-step {
          display: flex;
          align-items: center;
          gap: 14px;
          transition: opacity 0.3s;
        }
        .tc-prov-icon-wrap {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.3s;
        }
        .tc-prov-bar {
          height: 3px;
          border-radius: 99px;
          overflow: hidden;
          background: rgba(255,255,255,0.06);
          margin-top: 28px;
        }
        .tc-prov-bar-fill {
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, #1c3693, #358CFF, #4FDB95);
          transition: width 0.6s ease;
        }

        /* ─── Error ──────────────────────────────── */
        .tc-error-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.15);
          margin-bottom: 20px;
        }

        /* ─── Responsive ─────────────────────────── */
        @media (max-width: 768px) {
          .tc-redeem-container {
            flex-direction: column;
            max-width: 480px;
          }
          .tc-brand-panel {
            padding: 28px 24px;
          }
          .tc-brand-heading { font-size: 20px; }
          .tc-products { display: none; }
          .tc-brand-panel::after { display: none; }
          .tc-form-panel { padding: 24px; }
          .tc-form-logo { display: block; }
        }

        /* ─── Animations ─────────────────────────── */
        @keyframes tcCardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tcFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tcPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.06); }
        }
        @keyframes tcSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes tcStepIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Loading State ────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
      <Loader2
        style={{ width: 28, height: 28, color: "#358CFF", animation: "tcSpin 1s linear infinite" }}
      />
      <p style={{ marginTop: 16, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
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
      <div className="tc-form-header" style={{ animation: "tcFadeUp 0.4s ease both" }}>
        <img src={TC_LOGO} alt="Tiny Command" className="tc-form-logo" />
        <h1 className="tc-form-title">Activate your license</h1>
        <div className="tc-form-badge">
          {licenseInfo.partnerName} &middot; {tierLabel}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ animation: "tcFadeUp 0.4s 0.08s ease both" }}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="tc-form-label">Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@company.com" className="tc-input" {...field} />
                  </FormControl>
                  <FormMessage style={{ color: "#ef4444", fontSize: 12 }} />
                </FormItem>
              )}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, animation: "tcFadeUp 0.4s 0.12s ease both" }}>
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="tc-form-label">First name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane" className="tc-input" {...field} />
                  </FormControl>
                  <FormMessage style={{ color: "#ef4444", fontSize: 12 }} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="tc-form-label">Last name</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" className="tc-input" {...field} />
                  </FormControl>
                  <FormMessage style={{ color: "#ef4444", fontSize: 12 }} />
                </FormItem>
              )}
            />
          </div>

          <div style={{ animation: "tcFadeUp 0.4s 0.16s ease both" }}>
            <PasswordField form={form} />
          </div>

          <div style={{ animation: "tcFadeUp 0.4s 0.2s ease both", marginTop: 4 }}>
            <button type="submit" disabled={isPending} className="tc-submit-btn">
              {isPending ? (
                <Loader2 style={{ width: 18, height: 18, animation: "tcSpin 1s linear infinite" }} />
              ) : (
                <>
                  Get started
                  <ArrowRight style={{ width: 16, height: 16 }} />
                </>
              )}
            </button>
          </div>
        </form>
      </Form>

      <p className="tc-form-terms" style={{ animation: "tcFadeUp 0.4s 0.24s ease both" }}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </>
  );
}

// ─── Provisioning State ──────────────────────────────────────────────────────
function ProvisioningState({ currentStep }: { currentStep: number }) {
  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 36, animation: "tcFadeUp 0.4s ease both" }}>
        <img src={TC_LOGO} alt="Tiny Command" style={{ height: 28, marginBottom: 20 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          Setting things up
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
          This will only take a moment...
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PROVISIONING_PHASES.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;

          return (
            <div
              key={i}
              className="tc-prov-step"
              style={{
                animation: i <= currentStep ? `tcStepIn 0.35s ${i * 0.08}s ease both` : undefined,
                opacity: i > currentStep ? 0.15 : 1,
              }}
            >
              <div
                className="tc-prov-icon-wrap"
                style={{
                  background: isDone
                    ? "rgba(79,219,149,0.12)"
                    : isActive
                      ? "rgba(28,54,147,0.2)"
                      : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    isDone ? "rgba(79,219,149,0.25)" : isActive ? "rgba(28,54,147,0.35)" : "rgba(255,255,255,0.04)"
                  }`,
                  animation: isActive ? "tcPulse 1.5s ease-in-out infinite" : undefined,
                }}
              >
                {isDone ? (
                  <CheckCircle2 style={{ width: 18, height: 18, color: "#4FDB95" }} />
                ) : (
                  <Icon style={{ width: 18, height: 18, color: isActive ? "#358CFF" : "rgba(255,255,255,0.2)" }} />
                )}
              </div>
              <span style={{
                fontSize: 13,
                fontWeight: 500,
                color: isDone ? "#4FDB95" : isActive ? "#fff" : "rgba(255,255,255,0.2)",
              }}>
                {isDone ? step.label.replace("...", " ") + "Done" : step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="tc-prov-bar">
        <div
          className="tc-prov-bar-fill"
          style={{ width: `${((currentStep + 1) / PROVISIONING_PHASES.length) * 100}%` }}
        />
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
    <div style={{ textAlign: "center", padding: "40px 0", animation: "tcFadeUp 0.4s ease both" }}>
      <div className="tc-error-icon-wrap">
        <AlertTriangle style={{ width: 24, height: 24, color: "#ef4444" }} />
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 28px", lineHeight: 1.6 }}>
        {message}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {showRetry && (
          <button onClick={onRetry} className="tc-submit-btn">
            Try again
          </button>
        )}
        <a
          href="mailto:support@tinycommand.com"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            padding: "10px 16px",
            borderRadius: 10,
            color: "rgba(255,255,255,0.5)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            textDecoration: "none",
          }}
        >
          <Mail style={{ width: 14, height: 14 }} />
          Contact support
        </a>
      </div>
    </div>
  );
}

// ─── Password Field ──────────────────────────────────────────────────────────
function PasswordField({ form }: { form: ReturnType<typeof useForm<FormValues>> }) {
  const [show, setShow] = useState(false);
  return (
    <FormField
      control={form.control}
      name="password"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="tc-form-label">Password</FormLabel>
          <FormControl>
            <div style={{ position: "relative" }}>
              <Input
                type={show ? "text" : "password"}
                placeholder="Min. 8 characters"
                className="tc-input"
                style={{ paddingRight: 40 }}
                {...field}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                tabIndex={-1}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.3)",
                  padding: 0,
                }}
              >
                {show ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
              </button>
            </div>
          </FormControl>
          <FormMessage style={{ color: "#ef4444", fontSize: 12 }} />
        </FormItem>
      )}
    />
  );
}
