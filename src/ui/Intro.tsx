import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function Intro({ onBegin }: { onBegin: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from('.intro-orb', { scale: 0, opacity: 0, duration: 1.4, ease: 'power3.out' })
        .from('.intro-title', { y: 20, opacity: 0, duration: 1.0, ease: 'power2.out' }, '-=0.5')
        .from('.intro-sub', { opacity: 0, duration: 0.8 }, '-=0.5')
        .from('.intro-btn', { opacity: 0, y: 12, duration: 0.6 }, '-=0.3');
      gsap.to('.intro-orb', { scale: 1.12, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} className="relative flex h-full w-full flex-col items-center justify-center bg-abyss">
      <div
        className="intro-orb absolute h-[280px] w-[280px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #4FE3C1 0%, #1C8F8688 40%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <div className="intro-title font-display text-[90px] font-light leading-none tracking-[0.06em] text-pearl">
          TIDE
        </div>
        <div className="intro-sub label mt-4 text-pearl/50">move the water · not the ball</div>
        <button
          onClick={onBegin}
          className="intro-btn mt-14 rounded-full border border-teal/50 px-12 py-4 font-mono text-sm uppercase tracking-[0.25em] text-teal transition-colors hover:bg-teal/10"
          style={{ boxShadow: '0 0 40px #4FE3C133' }}
        >
          Begin
        </button>
      </div>
    </div>
  );
}
