import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function exec(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: opts?.cwd,
    env: opts?.env ?? process.env,
    maxBuffer: 50 * 1024 * 1024,
  });
  return { stdout, stderr };
}
