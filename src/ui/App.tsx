import { useRef, useState } from 'react';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { ArenaScreen } from './ArenaScreen';
import { HostConnection } from '../net/host';
import { SimPhone } from '../dev/simPhone';
import { makeRoomCode } from './qr';
import type { Slot } from '../net/protocol';

type Screen = 'intro' | 'lobby' | 'play';

export function App() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [room] = useState(
    () => new URLSearchParams(location.search).get('room')?.toUpperCase() || makeRoomCode(),
  );
  const hostRef = useRef<HostConnection | null>(null);
  const simRef = useRef<[SimPhone | null, SimPhone | null]>([null, null]);
  const [sims, setSims] = useState<[boolean, boolean]>([false, false]);

  function ensureHost(): HostConnection {
    if (!hostRef.current) {
      hostRef.current = new HostConnection(room);
      hostRef.current.start();
    }
    return hostRef.current;
  }

  function begin() {
    ensureHost();
    setScreen('lobby');
  }

  function toggleSim(slot: Slot) {
    const cur = simRef.current[slot];
    if (cur) {
      cur.stop();
      simRef.current[slot] = null;
      setSims((s) => (slot === 0 ? [false, s[1]] : [s[0], false]));
    } else {
      const sp = new SimPhone(room, slot);
      sp.start();
      simRef.current[slot] = sp;
      setSims((s) => (slot === 0 ? [true, s[1]] : [s[0], true]));
    }
  }

  if (screen === 'intro') return <Intro onBegin={begin} />;
  if (screen === 'lobby')
    return (
      <Lobby
        room={room}
        host={ensureHost()}
        onStart={() => setScreen('play')}
        sims={sims}
        onToggleSim={toggleSim}
      />
    );
  return <ArenaScreen host={hostRef.current ?? undefined} />;
}
