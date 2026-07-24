export const PROHIBITED_RELEASE_PATHS: RegExp[];

export function prohibitedReleasePaths(paths: string[]): string[];

export function assertReleasePathsSafe(
  paths: string[],
  sourceLabel: string,
): void;

export function assertCleanExactCommit(requestedCommit?: string): string;

export function auditArchive(archivePath: string): Promise<{
  sha256: string;
  entryCount: number;
}>;

export function packageRelease(options: {
  requestedCommit?: string;
  outputDirectory: string;
}): Promise<{
  archivePath: string;
  provenancePath: string;
  checksumPath: string;
  sha256: string;
  entryCount: number;
  commit: string;
}>;
