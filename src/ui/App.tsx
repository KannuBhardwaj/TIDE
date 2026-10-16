import { useRef, useState } from 'react';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { ArenaScreen } from './ArenaScreen';
import { HostConnection } from '../net/host';
import { SimPhone } from '../dev/simPhone';
import { MusicPlayer } from '../audio/player';
import { makeRoomCode } from './qr';
import type { Slot } from '../net/protocol';

type Screen = 'intro' | 'lobby' | 'play';
const DEFAULT_TRACK = 'surge';

export function App() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [room] = useState(
    () => new URLSearchParams(location.search).get('room')?.toUpperCase() || makeRoomCode(),
  );
  const hostRef = useRef<HostConnection | null>(null);
  const simRef = useRef<[SimPhone | null, SimPhone | null]>([null, null]);
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<MusicPlayer | null>(null);
  const [sims, setSims] = useState<[boolean, boolean]>([false, false]);

  function ensureHost(): HostConnection {
    if (!hostRef.current) {
      hostRef.current = new HostConnection(room);
      hostRef.current.start();
    }
    return hostRef.current;
  }

  function begin() {
    // user gesture: unlock audio + start loading the track
    if (!audioRef.current) audioRef.current = new AudioContext();
    audioRef.current.resume();
    if (!musicRef.current) {
      musicRef.current = new MusicPlayer(audioRef.current);
      musicRef.current.load(DEFAULT_TRACK).catch((e) => console.warn('track load failed', e));
    }
    ensureHost();
    setScreen('lobby');
  }

  function enterArena() {
    musicRef.current?.play();
    setScreen('play');
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
        onStart={enterArena}
        sims={sims}
        onToggleSim={toggleSim}
      />
    );
  return <ArenaScreen host={hostRef.current ?? undefined} music={musicRef.current ?? undefined} />;
}
