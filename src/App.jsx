import { useEffect, useMemo, useState } from "react";
import GlassesViewer from "./GlassesViewer";
import ARTryOn from "./ARTryOn";
import FitScanner from "./FitScanner";
import ImpactPage from "./ImpactPage";
import LensRecycle from "./LensRecycle";
import AIChatbot from "./AIChatbot";
import BottomNav from "./components/BottomNav";

const TABS = [
  { key: "configurator", label: "Configurator", component: GlassesViewer },
  { key: "ar", label: "AR Try-On", component: ARTryOn },
  { key: "chat", label: "AI Chat", component: AIChatbot },
  { key: "scanner", label: "AI Scanner", component: FitScanner },
  { key: "impact", label: "Impact", component: ImpactPage },
];

export default function App() {
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    const onNavigate = (event) => {
      if (!event?.detail) return;
      const targetIndex = TABS.findIndex((tab) => tab.key === event.detail);
      if (targetIndex !== -1) {
        setActivePage(targetIndex);
      }
    };

    window.addEventListener("ai-navigate", onNavigate);
    return () => window.removeEventListener("ai-navigate", onNavigate);
  }, []);

  const ActiveComponent = useMemo(
    () => TABS[activePage]?.component || GlassesViewer,
    [activePage]
  );

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <span className="app-logo">◈</span>
          <h1 className="app-title">OPTIQ</h1>
        </div>
      </header>

      <main className="app-content">
        <ActiveComponent />
      </main>

      <BottomNav activePage={activePage} setActivePage={setActivePage} />
    </div>
  );
}