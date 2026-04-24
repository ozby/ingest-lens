export interface GenerateBranchNameOptions {
  prefix?: string;
  timestamp?: Date;
  randomSuffix?: string;
}

export function generateBranchName(options: GenerateBranchNameOptions = {}): string {
  const prefix = options.prefix ?? "e2e";
  const timestamp = options.timestamp ?? new Date();
  const suffix = options.randomSuffix ?? Math.random().toString(36).slice(2, 6);
  const yyyy = timestamp.getUTCFullYear();
  const mm = `${timestamp.getUTCMonth() + 1}`.padStart(2, "0");
  const dd = `${timestamp.getUTCDate()}`.padStart(2, "0");
  const hh = `${timestamp.getUTCHours()}`.padStart(2, "0");
  const mi = `${timestamp.getUTCMinutes()}`.padStart(2, "0");
  const ss = `${timestamp.getUTCSeconds()}`.padStart(2, "0");

  return `${prefix}/${yyyy}${mm}${dd}${hh}${mi}${ss}-${suffix}`;
}
