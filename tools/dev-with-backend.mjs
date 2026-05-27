import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;

const spawnProcess = (label, command, args) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
  });

  children.push(child);

  child.on('exit', (code) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const process of children) {
      if (!process.killed) {
        process.kill();
      }
    }

    process.exit(code ?? 0);
  });

  return child;
};

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Starting DDO frontend and backend...');
spawnProcess('backend', 'node', ['server.mjs']);
spawnProcess('frontend', 'npm.cmd', ['run', 'dev']);
