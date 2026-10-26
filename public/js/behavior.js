// Behavior: given an agent's state from the server, decide WHERE the character
// should be (a spot) and WHAT it does there (an act used by the pose system).

// Spots claimed by someone, so two characters never sit on the same cushion.
const claims = new Map(); // spotId -> agentId

export function claim(spot, agentId) {
  for (const [k, v] of claims) if (v === agentId && k !== spot.id) claims.delete(k);
  claims.set(spot.id, agentId);
}
export function release(agentId) {
  for (const [k, v] of claims) if (v === agentId) claims.delete(k);
}
const isFree = (spot, agentId) => !claims.has(spot.id) || claims.get(spot.id) === agentId;

/**
 * Where does an idle agent hang out?  ✏️  Make this yours.
 *
 * @param {object} agent      server state: { name, kind: 'lead'|'sub', species, state, stats, ... }
 * @param {object[]} free     idle spots nobody else has claimed. Each has
 *                            { id: 'sofa-0' | 'coffee' | 'window-1' ..., kind: 'sofa'|'stand', act? }
 * @param {object} ctx        { seed: stable number per agent, idleFor: ms since the agent went idle }
 * @returns {object|null}     one of `free`, or null to just stay at the desk
 *
 * The default gives each agent a stable favourite place. Ideas to try:
 * leads always take the sofa, busy agents (stats.toolCalls high) go for coffee,
 * rotate to a new spot every minute using ctx.idleFor, robots stare out the window…
 */
export function pickIdleSpot(agent, free, ctx) {
  if (!free.length) return null;
  return free[ctx.seed % free.length];
}

export function decide(agent, char, world, others) {
  const desk = char.desk;
  const seat = desk?.seat;

  switch (agent.state) {
    case 'offline':
      return { spot: world.door, act: 'leaving' };

    case 'talking': {
      const target = others.get(agent.talkingTo);
      if (target?.spot) {
        // stand next to the person we're talking to, in a slot that's free
        const base = target.desk && target.spot === target.desk.seat ? target.desk : null;
        if (base) {
          for (let k = 0; k < 5; k++) {
            const s = base.side(k);
            if (isFree(s, agent.id)) return { spot: s, act: 'talk' };
          }
        }
        const p = target.spot.pos;
        return {
          spot: { id: `near-${target.id}`, kind: 'stand', pos: p.clone().add({ x: 0.9, y: 0, z: 0.7 }), face: Math.atan2(-0.9, -0.7), exit: target.spot.exit },
          act: 'talk',
        };
      }
      return { spot: seat, act: 'talking' };
    }

    case 'waiting':
      return { spot: desk.side(0), act: 'wave' };

    case 'working':
    case 'thinking': {
      if (agent.activity === 'planning' && isFree(world.whiteboard, agent.id)) return { spot: world.whiteboard, act: 'whiteboard' };
      return { spot: seat, act: agent.activity };
    }

    case 'done':
      // a few seconds of victory dance where the report happened
      if (Date.now() - agent.stateSince < 3500 && char.spot?.kind === 'stand') return { spot: char.spot, act: 'celebrate' };
    // falls through
    case 'idle': {
      const free = world.idleSpots.filter((s) => isFree(s, agent.id));
      const current = free.find((s) => s.id === char.spot?.id);
      // once settled somewhere, stay there instead of re-rolling every update
      const spot = current || pickIdleSpot(agent, free, { seed: char.seed, idleFor: Date.now() - agent.stateSince });
      if (!spot) return { spot: seat, act: 'idle' };
      return { spot, act: spot.act || 'idle' };
    }

    default:
      return { spot: seat, act: 'idle' };
  }
}
