import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TABS = [
  {
    label: 'Configurator',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    label: 'AR Try-On',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
  {
    label: 'AI Scanner',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 8v1M12 15v1M8 12h1M15 12h1" />
      </svg>
    ),
  },
  {
    label: 'Our Impact',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export default function BottomNav({ activePage, setActivePage }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div className="bottom-nav-wrap">
      <div className="bottom-nav-bar">
        {TABS.map((tab, i) => {
          const isActive = activePage === i;
          return (
            <motion.button
              key={tab.label}
              className="bottom-tab"
              onClick={() => setActivePage(i)}
              onHoverStart={() => setHoveredIdx(i)}
              onHoverEnd={() => setHoveredIdx(null)}
              animate={{
                width: isActive ? 'auto' : 44,
                backgroundColor: isActive
                  ? 'rgba(255,255,255,0.18)'
                  : hoveredIdx === i
                    ? 'rgba(255,255,255,0.08)'
                    : 'transparent',
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <motion.span
                className="bottom-tab-icon"
                animate={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.4)' }}
                transition={{ duration: 0.2 }}
              >
                {tab.icon}
              </motion.span>

              <AnimatePresence>
                {isActive && (
                  <motion.span
                    className="bottom-tab-label"
                    initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                    animate={{ opacity: 1, width: 'auto', marginLeft: 7 }}
                    exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
