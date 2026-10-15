import React from 'react';
import { Home } from 'lucide-react';

export type MainTab = 'rotina' | 'home' | 'casa';

interface BottomNavProps {
  currentTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}

/**
 * Três abas: Rotina (esquerda), Início (centro, com ícone) e Casa (direita).
 * Rotina e Casa abrem menus que levam às telas menos usadas.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange }) => {
  const item = (id: MainTab, content: React.ReactNode) => {
    const isActive = currentTab === id;
    return (
      <button
        key={id}
        onClick={() => onTabChange(id)}
        className={`relative h-14 flex flex-col items-center justify-center gap-0.5 text-sm transition-colors ${
          isActive ? 'text-forest font-semibold' : 'text-muted'
        }`}
      >
        {isActive && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-forest rounded-full" />
        )}
        {content}
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-paper border-t border-line pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-3">
        {item('rotina', 'Rotina')}
        {item(
          'home',
          <>
            <Home className="w-5 h-5" strokeWidth={currentTab === 'home' ? 2.2 : 1.8} />
            <span className="text-[11px]">Início</span>
          </>
        )}
        {item('casa', 'Casa')}
      </div>
    </nav>
  );
};
