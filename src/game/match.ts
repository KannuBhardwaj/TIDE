/**
 * Match rules: scoring, goal detection, win condition. Pure logic (no GL /
 * no DOM) so it is straightforward to unit test. The loop owns timing (goal
 * freeze, reset) and calls into this.
 *
 * Convention: Team A defends the LEFT goal and attacks the RIGHT goal; Team B
 * is the mirror. So a ball crossing the right goal line scores for A, and the
 * left goal line scores for B.
 */
import type { Team } from './player';

export type MatchState = 'playing' | 'goal' | 'ended';

export interface GoalGeom {
  inset: number; // goal line distance from the x edge (uv)
  half: number; // half the mouth height (uv)
}

/**
 * Returns which team scored, or null. `ballX/Y` is the ball center and `ballR`
 * its radius (uv) — we test the leading edge so the ball can score even though
 * the arena clamps its center at 1 - radius (short of the goal line).
 */
export function detectGoal(
  ballX: number,
  ballY: number,
  ballR: number,
  geom: GoalGeom,
): Team | null {
  const inMouth = ballY > 0.5 - geom.half && ballY < 0.5 + geom.half;
  if (!inMouth) return null;
  if (ballX + ballR > 1 - geom.inset) return 'A'; // right line crossed
  if (ballX - ballR < geom.inset) return 'B'; // left line crossed
  return null;
}

export class Match {
  scoreA = 0;
  scoreB = 0;
  state: MatchState = 'playing';
  /** team of the most recent goal (for the goal-moment visuals). */
  lastScorer: Team | null = null;
  /** final result once ended: winner, or 'draw'. */
  result: Team | 'draw' | null = null;

  constructor(private goalsToWin: number) {}

  /** record a goal; returns true if this goal ended the match. */
  registerGoal(team: Team): boolean {
    if (this.state === 'ended') return true;
    if (team === 'A') this.scoreA++;
    else this.scoreB++;
    this.lastScorer = team;
    if (this.winner) {
      this.result = this.winner;
      this.state = 'ended';
      return true;
    }
    this.state = 'goal';
    return false;
  }

  /** end the match now (e.g. the track finished); leader wins, ties draw. */
  finish() {
    if (this.state === 'ended') return;
    this.result = this.scoreA > this.scoreB ? 'A' : this.scoreB > this.scoreA ? 'B' : 'draw';
    this.state = 'ended';
  }

  /** winner once someone reaches the target, else null. */
  get winner(): Team | null {
    if (this.scoreA >= this.goalsToWin && this.scoreA > this.scoreB) return 'A';
    if (this.scoreB >= this.goalsToWin && this.scoreB > this.scoreA) return 'B';
    return null;
  }

  resume() {
    if (this.state === 'goal') this.state = 'playing';
  }

  reset() {
    this.scoreA = 0;
    this.scoreB = 0;
    this.state = 'playing';
    this.lastScorer = null;
    this.result = null;
  }
}
