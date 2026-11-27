import React from "react";
export function Orb({ state }: { state: string }) {
  return (
    <div className="orb-wrap" aria-hidden="true">
      <div className="ambient a1" /><div className="ambient a2" />
      <div className="orb" data-state={state}>
        <div className="ring outer"><i /><i /><i /><i /></div>
        <svg className="ticks" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(0,162,255,.45)"
            stroke-width="3" stroke-dasharray="2 8" />
        </svg>
        <svg className="segs" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="76" fill="none" stroke="#00a2ff" stroke-width="4"
            stroke-dasharray="110 130" stroke-linecap="round" opacity="0.9" />
          <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(124,213,255,.55)" stroke-width="2"
            stroke-dasharray="40 90" stroke-linecap="round" />
        </svg>
        <div className="ring inner" />
        <div className="flare" />
        <span className="orb-label">J.A.R.V.I.S.</span>
      </div>
    </div>
  );
}
