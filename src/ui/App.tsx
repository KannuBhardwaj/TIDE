import { useRef, useState } from 'react';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { ArenaScreen } from './ArenaScreen';
import { HostConnection } from '../net/host';
import { SimPhone } from '../dev/simPhone';
import { MusicPlayer } from '../audio/player';
import { SfxEngine } from '../audio/sfx';
import { makeRoomCode } from './qr';
import type { Slot } from '../net/protocol';

type Screen = 'intro' | 'lobby' | 'play';
const DEFAULT_TRACK = 'rising_tide';

const NOTE_HZ: Record<string, number> = {
  C: 65.41, 'C#': 69.3, D: 73.42, 'D#': 77.78, E: 82.41, F: 87.31,
  'F#': 92.5, G: 98.0, 'G#': 103.83, A: 110.0, 'A#': 116.54, B: 123.47,
};
function keyRoot(key?: string): number {
  if (!key) return 110;
  const m = key.trim().match(/^([A-Ga-g])(#?)/);
  if (!m) return 110;
  return NOTE_HZ[m[1].toUpperCase() + m[2]] ?? 110;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [room] = useState(
    () => new URLSearchParams(location.search).get('room')?.toUpperCase() || makeRoomCode(),
  );
  const hostRef = useRef<HostConnection | null>(null);
  const simRef = useRef<[SimPhone | null, SimPhone | null]>([null, null]);
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<MusicPlayer | null>(null);
  const sfxRef = useRef<SfxEngine | null>(null);
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
    if (!sfxRef.current) sfxRef.current = new SfxEngine(audioRef.current);
    if (!musicRef.current) {
      const music = new MusicPlayer(audioRef.current);
      musicRef.current = music;
      sfxRef.current.onDuck = (a, s) => music.duck(a, s);
      music
        .load(DEFAULT_TRACK)
        .then(() => sfxRef.current?.setKey(keyRoot(music.track?.meta.key)))
        .catch((e) => console.warn('track load failed', e));
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
  return (
    <ArenaScreen
      host={hostRef.current ?? undefined}
      music={musicRef.current ?? undefined}
      sfx={sfxRef.current ?? undefined}
    />
  );
}
