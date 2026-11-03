import { isWalkable } from './world.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// BFS a partir de (sx,sy). Retorna lista de passos [x,y] (sem o início), [] se já está no objetivo, ou null.
export function bfs(world, sx, sy, isGoal, limit = 5000) {
  const { w, h } = world;
  if (isGoal(sx, sy)) return [];
  const prev = new Int32Array(w * h).fill(-2);
  const start = sy * w + sx;
  const q = [start];
  prev[start] = -1;
  let head = 0;
  while (head < q.length && head < limit) {
    const c = q[head++];
    const cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -2 || !isWalkable(world, nx, ny)) continue;
      prev[ni] = c;
      if (isGoal(nx, ny)) {
        const path = [];
        let cur = ni;
        while (cur !== -1) { path.push([cur % w, (cur / w) | 0]); cur = prev[cur]; }
        path.pop();
        return path.reverse();
      }
      q.push(ni);
    }
  }
  return null;
}

export const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
