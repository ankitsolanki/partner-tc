import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const PLATFORM_URL = "https://app.tinycommand.com";
const COUNTDOWN_SECS = 5;
const TC_LOGO = "https://cdn-v1.tinycommand.com/1234567890/1771243665296/tinybox%20logo%20%281%29.png";

function getRedirectUrl(email: string | null, isNewUser: boolean): string {
  if (isNewUser && email) {
    return `${PLATFORM_URL}`;
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

function ProductIcon({ type, size = 22 }: { type: string; size?: number }) {
  const id = `s-${type}-${Math.random().toString(36).slice(2, 6)}`;
  const common = { width: size, height: size, viewBox: "0 0 100 100", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (type) {
    case "form": return (<svg {...common}><circle cx="50" cy="50" r="50" fill={`url(#${id})`}/><path d="M47.4063 72.4868H31.4746V43.4302L31.5678 43.3254L40.6283 32.4947L43.8892 28.6049L44.8092 27.4985H68.532V43.4419H47.3948V72.4985L47.4063 72.4868Z" fill="white"/><path d="M68.0947 51.1323H53.7119V65.5151H68.0947V51.1323Z" fill="white"/><defs><linearGradient id={id} x1="94" y1="0" x2="-9" y2="118" gradientUnits="userSpaceOnUse"><stop stopColor="#FFBA08"/><stop offset="1" stopColor="#FF7B52"/></linearGradient></defs></svg>);
    case "workflow": return (<svg {...common}><circle cx="50" cy="50" r="50" fill={`url(#${id})`}/><path d="M62.7094 60.5243V72.4895H44.1949L29.7598 60.5243L29.5615 60.36V44.4517H44.1949V60.5243H62.7094Z" fill="white"/><path d="M39.6133 39.4654V27.5H58.128L72.5628 39.4654L72.7613 39.6297V55.5379H58.128V39.4654H39.6133Z" fill="white"/><defs><linearGradient id={id} x1="140" y1="-36" x2="4" y2="94" gradientUnits="userSpaceOnUse"><stop stopColor="#358CFF"/><stop offset="1" stopColor="#1C3693"/></linearGradient></defs></svg>);
    case "table": return (<svg {...common}><circle cx="50" cy="50" r="50" fill={`url(#${id})`}/><path d="M42.7064 43.8694H27.5V28.9639H45.1238L45.9815 29.9999L49.034 33.6427L57.5005 43.7692L57.5898 43.8694V71.0405H42.6952V43.8694H42.7064Z" fill="white"/><path d="M72.5017 28.9639H57.6074V43.8583H72.5017V28.9639Z" fill="white"/><defs><linearGradient id={id} x1="-12" y1="109" x2="104" y2="-1" gradientUnits="userSpaceOnUse"><stop stopColor="#369B7D"/><stop offset="1" stopColor="#4FDB95"/></linearGradient></defs></svg>);
    case "email": return (<svg {...common}><circle cx="50" cy="50" r="50" fill={`url(#${id})`}/><path d="M63.8447 39.2642H48.2471V39.2935L48.2549 39.3013H48.2471V60.6978H48.2461V60.7339H63.8447V72.4995H46.3389L36.499 60.7427V39.2563L36.5674 39.1782L46.3389 27.4995H63.8447V39.2642ZM48.2549 60.6978L48.2471 60.7065V60.6978H48.2549Z" fill="white"/><path d="M63.5177 44.9443H52.9043V55.5578H63.5177V44.9443Z" fill="white"/><defs><linearGradient id={id} x1="113" y1="-19" x2="-61" y2="155" gradientUnits="userSpaceOnUse"><stop stopColor="#EC3957"/><stop offset="1" stopColor="#FF7B52"/></linearGradient></defs></svg>);
    case "agent": return (<svg {...common}><circle cx="50" cy="50" r="50" fill={`url(#${id})`}/><path d="M74.999 27.5005V44.1147H74.8926L75.0029 44.2524V72.4995H61.7734V44.2524H38.9375V72.5005H25.0039V44.2524L38.9375 27.7368L39.1309 27.5005H74.999ZM57.626 65.5581H44.0342V51.9673H57.626V65.5581Z" fill="white"/><defs><linearGradient id={id} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#8133F1"/><stop offset="1" stopColor="#360083"/></linearGradient></defs></svg>);
    default: return null;
  }
}

const PRODUCTS = [
  { name: "Forms", type: "form" },
  { name: "Workflows", type: "workflow" },
  { name: "Tables", type: "table" },
  { name: "Email", type: "email" },
  { name: "Agents", type: "agent" },
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
              <ProductIcon type={p.type} size={20} />
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
        .tcs-product-pill svg {
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
