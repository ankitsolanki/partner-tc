import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const PLATFORM_URL = "https://platform.tinycommand.com";
const COUNTDOWN_SECS = 5;
const TC_LOGO = "https://cdn-v1.tinycommand.com/1234567890/1771243665296/tinybox%20logo%20%281%29.png";

function getRedirectUrl(email: string | null, isNewUser: boolean): string {
  if (isNewUser && email) {
    return `${PLATFORM_URL}/login?login_hint=${encodeURIComponent(email)}`;
  }
  return PLATFORM_URL;
}

const CONFETTI_COLORS = ["#1c3693", "#358CFF", "#4FDB95", "#FFBA08", "#FF7B52", "#EC3957", "#8133F1"];

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

const PRODUCTS = [
  { name: "Forms", gradient: ["#FFBA08", "#FF7B52"] },
  { name: "Workflows", gradient: ["#358CFF", "#1C3693"] },
  { name: "Tables", gradient: ["#369B7D", "#4FDB95"] },
  { name: "Email", gradient: ["#EC3957", "#FF7B52"] },
  { name: "Agents", gradient: ["#8133F1", "#360083"] },
];

export default function RedeemSuccess() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const name = params.get("name");
  const email = params.get("email");
  const isNewUser = params.get("isNewUser") === "true";
  const redirectUrl = getRedirectUrl(email, isNewUser);

  console.log("[RedeemSuccess] Page loaded | name:", name, "| email:", email, "| isNewUser:", isNewUser);

  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [confetti] = useState(() => buildConfetti(60));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          window.location.href = redirectUrl;
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
    <div className="tcs-page">
      {/* Background */}
      <div className="tcs-bg-grid" aria-hidden="true" />
      <div className="tcs-bg-glow tcs-bg-glow-1" aria-hidden="true" />
      <div className="tcs-bg-glow tcs-bg-glow-2" aria-hidden="true" />

      {/* Confetti */}
      {confetti.map((piece) => (
        <div
          key={piece.id}
          aria-hidden="true"
          className="tcs-confetti"
          style={{
            left: piece.left,
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
            borderRadius: piece.isCircle ? "50%" : "2px",
            animationDuration: piece.duration,
            animationDelay: piece.delay,
            transform: `rotate(${piece.rotation})`,
          }}
        />
      ))}

      <div className="tcs-card" style={{ animation: "tcsCardIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards" }}>
        {/* Logo */}
        <img src={TC_LOGO} alt="Tiny Command" className="tcs-logo" style={{ animation: "tcsFadeUp 0.4s ease both" }} />

        {/* Checkmark */}
        <div className="tcs-check-wrap" style={{ animation: "tcsPopIn 0.6s 0.15s cubic-bezier(0.175,0.885,0.32,1.275) both" }}>
          <div className="tcs-check-ring" />
          <CheckCircle2 className="tcs-check-icon" />
        </div>

        {/* Heading */}
        <h1 className="tcs-heading" style={{ animation: "tcsFadeUp 0.5s 0.3s ease both" }}>
          {name ? (
            <>Welcome, {name.split(" ")[0]}!</>
          ) : (
            <>You're all set!</>
          )}
        </h1>

        <p className="tcs-subtitle" style={{ animation: "tcsFadeUp 0.5s 0.4s ease both" }}>
          Your AppSumo lifetime deal is now active.
          <br />You have access to the full Tiny Command suite.
        </p>

        {email && (
          <p className="tcs-email" style={{ animation: "tcsFadeUp 0.5s 0.45s ease both" }}>
            {email}
          </p>
        )}

        {/* Product pills */}
        <div className="tcs-products" style={{ animation: "tcsFadeUp 0.5s 0.5s ease both" }}>
          {PRODUCTS.map((p) => (
            <div key={p.name} className="tcs-product-pill">
              <div
                className="tcs-product-dot"
                style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
              />
              <span>{p.name}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="tcs-divider" style={{ animation: "tcsFadeUp 0.5s 0.55s ease both" }} />

        {/* Countdown */}
        <div style={{ animation: "tcsFadeUp 0.5s 0.6s ease both" }}>
          <p className="tcs-countdown-text">
            Taking you to your dashboard in{" "}
            <span className="tcs-countdown-num">{countdown}s</span>
          </p>
          <div className="tcs-progress-track">
            <div
              className="tcs-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* CTA */}
        <div style={{ animation: "tcsFadeUp 0.5s 0.65s ease both" }}>
          <button onClick={() => { window.location.href = redirectUrl; }} className="tcs-cta-btn">
            Go to Tiny Command
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      <style>{`
        .tcs-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: #060a18;
          font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
        }

        .tcs-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(28,54,147,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(28,54,147,0.06) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .tcs-bg-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(100px);
        }
        .tcs-bg-glow-1 {
          width: 500px; height: 500px;
          top: 10%; left: 20%;
          background: radial-gradient(circle, rgba(28,54,147,0.2), transparent 70%);
        }
        .tcs-bg-glow-2 {
          width: 400px; height: 400px;
          bottom: 5%; right: 15%;
          background: radial-gradient(circle, rgba(79,219,149,0.08), transparent 70%);
        }

        .tcs-confetti {
          position: absolute;
          top: 0;
          pointer-events: none;
          opacity: 0;
          animation-name: tcsConfettiFall;
          animation-timing-function: ease-in;
          animation-fill-mode: forwards;
        }

        .tcs-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 460px;
          text-align: center;
          padding: 40px 36px;
          border-radius: 20px;
          background: rgba(10,15,31,0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(28,54,147,0.2);
          box-shadow: 0 40px 100px rgba(0,0,0,0.5);
        }

        .tcs-logo {
          height: 28px;
          margin-bottom: 28px;
        }

        .tcs-check-wrap {
          position: relative;
          display: inline-flex;
          margin-bottom: 24px;
        }
        .tcs-check-ring {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 2px solid rgba(79,219,149,0.2);
          animation: tcsRingPulse 2s 0.8s ease-out infinite;
        }
        .tcs-check-icon {
          width: 48px;
          height: 48px;
          color: #4FDB95;
        }

        .tcs-heading {
          font-size: 26px;
          font-weight: 700;
          color: #fff;
          margin: 0 0 10px;
          letter-spacing: -0.02em;
        }

        .tcs-subtitle {
          font-size: 14px;
          line-height: 1.6;
          color: rgba(255,255,255,0.5);
          margin: 0 0 6px;
        }

        .tcs-email {
          font-size: 12px;
          color: rgba(255,255,255,0.25);
          margin: 0 0 20px;
        }

        .tcs-products {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          margin-bottom: 20px;
        }
        .tcs-product-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px 5px 6px;
          border-radius: 100px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
        }
        .tcs-product-dot {
          width: 18px;
          height: 18px;
          border-radius: 6px;
          flex-shrink: 0;
        }

        .tcs-divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin: 20px 0;
        }

        .tcs-countdown-text {
          font-size: 13px;
          color: rgba(255,255,255,0.4);
          margin: 0 0 10px;
        }
        .tcs-countdown-num {
          font-weight: 600;
          color: #fff;
        }

        .tcs-progress-track {
          height: 3px;
          border-radius: 99px;
          overflow: hidden;
          background: rgba(255,255,255,0.06);
          margin-bottom: 20px;
        }
        .tcs-progress-fill {
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, #1c3693, #358CFF, #4FDB95);
          transition: width 1s linear;
        }

        .tcs-cta-btn {
          width: 100%;
          height: 46px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          font-family: inherit;
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
        .tcs-cta-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(28,54,147,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        @keyframes tcsConfettiFall {
          0%   { opacity: 1;   transform: translateY(-20px) rotate(0deg) scaleX(1); }
          50%  { opacity: 0.8; transform: translateY(50vh) rotate(360deg) scaleX(-1); }
          100% { opacity: 0;   transform: translateY(110vh) rotate(720deg) scaleX(1); }
        }
        @keyframes tcsCardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tcsFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tcsPopIn {
          0%   { opacity: 0; transform: scale(0); }
          70%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes tcsRingPulse {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        @media (max-width: 480px) {
          .tcs-card { padding: 28px 20px; }
          .tcs-heading { font-size: 22px; }
        }
      `}</style>
    </div>
  );
}
