import path from 'path';
import { rmSync, statSync, writeFileSync } from 'fs';
import { addHours, isBefore } from 'date-fns';

export function initLockFile(config) {
  if (config.no_lock) return;
  const home = config.home;
  const lockFile = path.join(home, '.lock');
  try {
    const old = addHours(new Date(), -3);
    const stats = statSync(lockFile);
    if (isBefore(stats.birthtime, old)) {
      rmSync(lockFile);
    } else {
      console.error('Lock file there, aborting!');
      process.exit(404);
    }
  } catch {}
  writeFileSync(lockFile, 'lock', 'utf-8');
  return lockFile;
}
