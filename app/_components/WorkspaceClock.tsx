"use client";

import { useEffect, useState } from "react";
import { czechNamedays } from "../content/czechNamedays";

export default function WorkspaceClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const hours = now ? String(now.getHours()).padStart(2, "0") : "--";
  const minutes = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const date = now ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` : "---- -- --";
  const day = now ? `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` : "";
  const nameday = day === "08-04" ? "Dominika" : day ? czechNamedays[day] : "—";
  return <div className="workspace-status">
    <span className="live-clock">{hours}<i className={now && now.getSeconds() % 2 === 0 ? "visible" : ""}>:</i>{minutes}</span>
    <span>{date}</span><span className="nameday" title={nameday}>{nameday.toLocaleUpperCase("cs-CZ")}</span>
  </div>;
}
