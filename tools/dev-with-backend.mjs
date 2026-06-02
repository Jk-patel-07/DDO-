import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;

const createWindowsSafeEnv = () => {
  if (process.platform !== 'win32') {
    return process.env;
  }

  const env = { ...process.env };
  const pathValue = env.Path || env.PATH || env.path;

  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') {
      delete env[key];
    }
  }

  if (pathValue) {
    env.Path = pathValue;
  }

  return env;
};

const spawnProcess = (label, command, args) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: createWindowsSafeEnv(),
  });

  children.push(child);

  child.on('error', (error) => {
    console.error(`${label} failed to start:`, error.message);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const process of children) {
        if (!process.killed) {
          process.kill();
        }
      }
      process.exit(1);
    }
  });

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
spawnProcess('backend', process.execPath, ['server.mjs']);
spawnProcess(
  'frontend',
  process.platform === 'win32' ? 'cmd.exe' : 'npm',
  process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run dev'] : ['run', 'dev'],
);
