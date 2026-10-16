import fs from 'node:fs';
import { runArgonAcceptance } from '../src/argonAcceptance';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--grant' || !args[1]) {
    console.log(JSON.stringify({ outcome: 'refused', reason: 'invalid-cli-arguments' })); process.exitCode = 1; return;
  }
  let fd: number | undefined, bytes: Uint8Array;
  try {
    fd = fs.openSync(args[1], 'r');
    if (!fs.fstatSync(fd).isFile()) throw Error();
    const buffer = Buffer.alloc(16385); let size = 0;
    while (size < buffer.length) {
      const n = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > 16384) throw Error();
    bytes = buffer.subarray(0, size);
  } catch {
    console.log(JSON.stringify({ outcome: 'refused', reason: 'grant-read-refused' })); process.exitCode = 1; return;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
  const report = await runArgonAcceptance(bytes);
  console.log(JSON.stringify(report)); process.exitCode = report.outcome === 'completed' ? 0 : 1;
};
void main().catch(() => { console.log(JSON.stringify({ outcome: 'refused', reason: 'operator-refused' })); process.exitCode = 1; });
