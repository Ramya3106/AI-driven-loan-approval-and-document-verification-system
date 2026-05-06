const { execSync } = require('child_process');

const port = Number(process.argv[2] || 5000);

if (!Number.isFinite(port) || port <= 0) {
  process.exit(0);
}

try {
  const netstatOutput = execSync(`netstat -ano -p tcp | findstr :${port}`, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).toString();

  const pids = new Set();
  for (const line of netstatOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !/LISTENING/i.test(trimmed)) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true });
      console.log(`Stopped process ${pid} on port ${port}`);
    } catch (error) {
      // Ignore if the process already exited.
    }
  }
} catch (error) {
  // No listener found; continue startup.
}