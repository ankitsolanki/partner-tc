import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const REDIRECT_URL = "https://platform.tinycommand.com";
const COUNTDOWN_SECS = 5;

const CONFETTI_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#f43f5e",
  "#a3e635",
];

interface ConfettiPiece {
  id: number;
  color: string;
  left: string;
  delay: string;
  duration: string;
  width: string;
  height: string;
  rotation: string;
  isCircle: boolean;
}

function buildConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${(i / count) * 100 + (Math.sin(i * 2.4) * 8)}%`,
    delay: `${(i * 0.07) % 3}s`,
    duration: `${3.5 + (i % 5) * 0.4}s`,
    width: `${6 + (i % 5) * 2}px`,
    height: `${8 + (i % 4) * 3}px`,
    rotation: `${(i * 47) % 360}deg`,
    isCircle: i % 3 === 0,
  }));
}

export default function RedeemSuccess() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const name = params.get("name");
  const email = params.get("email");

  console.log("[RedeemSuccess] ─── Page loaded ───");
  console.log("[RedeemSuccess] URL search:", searchStr);
  console.log("[RedeemSuccess] Name:", name);
  console.log("[RedeemSuccess] Email:", email);
  console.log("[RedeemSuccess] Will redirect to:", REDIRECT_URL, "in", COUNTDOWN_SECS, "seconds");

  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [confetti] = useState(() => buildConfetti(70));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          window.location.href = REDIRECT_URL;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const progress = ((COUNTDOWN_SECS - countdown) / COUNTDOWN_SECS) * 100;

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}
      data-testid="page-redeem-success"
    >
      {/* Confetti rain */}
      {confetti.map((piece) => (
        <div
          key={piece.id}
          aria-hidden="true"
          className="absolute top-0 pointer-events-none"
          style={{
            left: piece.left,
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
            borderRadius: piece.isCircle ? "50%" : "2px",
            opacity: 0,
            animation: `confettiFall ${piece.duration} ${piece.delay} ease-in forwards`,
            transform: `rotate(${piece.rotation})`,
          }}
        />
      ))}

      {/* Radial glow behind card */}
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
        className="relative z-10 w-full max-w-md text-center px-8 py-12 rounded-3xl"
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
          animation: "cardIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
        }}
      >
        {/* Animated checkmark circle */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center"
              style={{
                border: "3px solid #34d399",
                animation: "popIn 0.6s 0.1s cubic-bezier(0.175,0.885,0.32,1.275) both",
                boxShadow: "0 0 0 0 rgba(52,211,153,0.4)",
              }}
            >
              <svg
                viewBox="0 0 52 52"
                className="w-14 h-14"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  stroke="#34d399"
                  strokeWidth="4.5"
                  d="M14 27 L22 35 L38 17"
                  style={{
                    strokeDasharray: 40,
                    strokeDashoffset: 40,
                    animation: "drawCheck 0.45s 0.55s ease forwards",
                  }}
                />
              </svg>
            </div>
            {/* Pulse ring */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid rgba(52,211,153,0.3)",
                animation: "ringPulse 2s 0.8s ease-out infinite",
              }}
            />
          </div>
        </div>

        {/* Heading */}
        <h1
          className="text-3xl font-bold text-white mb-3 leading-tight"
          style={{ animation: "fadeUp 0.5s 0.35s ease both" }}
          data-testid="text-congrats"
        >
          {name ? (
            <>Congratulations,<br />{name}! 🎉</>
          ) : (
            <>Congratulations! 🎉</>
          )}
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg mb-2 font-medium"
          style={{
            color: "rgba(196,181,253,0.9)",
            animation: "fadeUp 0.5s 0.5s ease both",
          }}
          data-testid="text-subtitle"
        >
          Your AppSumo license has been activated
          <br />and linked to your account.
        </p>

        {email && (
          <p
            className="text-sm mb-6"
            style={{
              color: "rgba(196,181,253,0.45)",
              animation: "fadeUp 0.5s 0.6s ease both",
            }}
            data-testid="text-email"
          >
            {email}
          </p>
        )}

        {/* Divider */}
        <div
          className="my-6 h-px"
          style={{
            background: "rgba(255,255,255,0.08)",
            animation: "fadeUp 0.5s 0.65s ease both",
          }}
        />

        {/* Countdown bar */}
        <div
          className="mb-6"
          style={{ animation: "fadeUp 0.5s 0.7s ease both" }}
        >
          <p
            className="text-sm mb-3"
            style={{ color: "rgba(196,181,253,0.6)" }}
            data-testid="text-countdown"
          >
            Redirecting you to Tiny Command in{" "}
            <span className="font-semibold text-white">{countdown}s</span>…
          </p>
          <div
            className="h-1.5 w-full rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #6366f1, #34d399)",
                transition: "width 1s linear",
              }}
            />
          </div>
        </div>

        {/* CTA */}
        <div style={{ animation: "fadeUp 0.5s 0.8s ease both" }}>
          <Button
            onClick={() => { window.location.href = REDIRECT_URL; }}
            className="w-full h-12 rounded-xl font-semibold text-base gap-2"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              border: "none",
              boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
            }}
            data-testid="button-go-now"
          >
            Take me to Tiny Command
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes confettiFall {
          0%   { opacity: 1;   transform: translateY(-20px) rotate(0deg)   scaleX(1); }
          50%  { opacity: 0.8; transform: translateY(50vh)  rotate(360deg) scaleX(-1); }
          100% { opacity: 0;   transform: translateY(110vh) rotate(720deg) scaleX(1); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes popIn {
          0%   { opacity: 0; transform: scale(0); }
          70%  { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ringPulse {
          0%   { transform: scale(1);    opacity: 0.6; }
          100% { transform: scale(1.8);  opacity: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
