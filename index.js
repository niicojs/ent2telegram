// ts-check
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';

import getConfig from './config.js';
import { initLockFile } from './utils.js';
import Telegram from './telegram.js';
import Ent from './ent.js';

const { values: options } = parseArgs({
  options: {
    home: {
      type: 'string',
    },
  },
});

const home = options.home || '.';
const historyFile = path.join(home, 'history.json');

console.log('Load config & history...');
const config = getConfig(home);

const lockFile = initLockFile(config);
try {
  const history = [];
  if (existsSync(historyFile)) {
    history.push(
      ...JSON.parse(readFileSync(historyFile, 'utf8')).map((h) => ({
        ...h,
        date: new Date(h.date),
      }))
    );
  }

  const telegram = Telegram(config);
  const ent = Ent(config);

  console.log('Login...');
  const info = await ent.login();
  console.log('Logged in as ' + info.username);

  let notifs = await ent.notifications();
  console.log(notifs);
  notifs = notifs.filter((p) => !history.find((h) => h.id === p.id));

  for (const notif of notifs) {
    try {
      await telegram.sendMessage(notif);
      history.push({ id: notif.id, date: notif.date });
    } catch (e) {
      console.log('Error');
      const error = await e.response.json();
      console.log(error || e.message);
      console.log(e);
    }
  }

  console.log('Save history...');
  let synchistory = history;
  if (synchistory.length > 200) {
    synchistory = synchistory.slice(synchistory.length - 200);
  }
  writeFileSync(historyFile, JSON.stringify(synchistory, null, 2), 'utf8');

  console.log('Done.');
} finally {
  try {
    rmSync(lockFile);
  } catch {}
}
