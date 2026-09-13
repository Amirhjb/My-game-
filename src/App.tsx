import { useEffect, useState } from 'react';
import { useGame } from './hooks/useGame';
import { applyTheme } from './theme';
import { Death } from './screens/Death';
import { Game } from './screens/Game';
import { ArchetypePick, GenrePick, Intro, NarratorPick, TraitsPick } from './screens/Setup';
import { SettingsModal } from './modals/SettingsModal';

export default function App() {
  const api = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // La piel visual completa deriva del género elegido.
  useEffect(() => { applyTheme(api.state.genre); }, [api.state.genre]);

  // Aviso al cerrar con una acción en vuelo, para no perder el turno.
  useEffect(() => {
    if (api.status !== 'thinking') return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [api.status]);

  const screen = api.state.screen;

  return (
    <div className="app">
      {screen === 'intro' && <Intro api={api} onSettings={() => setSettingsOpen(true)} />}
      {screen === 'genre' && <GenrePick api={api} />}
      {screen === 'archetype' && <ArchetypePick api={api} />}
      {screen === 'traits' && <TraitsPick api={api} />}
      {screen === 'narrator' && <NarratorPick api={api} onSettings={() => setSettingsOpen(true)} />}
      {screen === 'game' && <Game api={api} onSettings={() => setSettingsOpen(true)} />}
      {screen === 'death' && <Death api={api} />}

      {settingsOpen && <SettingsModal api={api} onClose={() => setSettingsOpen(false)} />}
      {api.flash && <div className="flash" aria-hidden />}
    </div>
  );
}
