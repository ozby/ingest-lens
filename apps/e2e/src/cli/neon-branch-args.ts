export interface NeonBranchCliArgs {
  branchId?: string;
  name?: string;
  ttlHours?: number;
  maxAgeHours?: number;
}

export function parseNeonBranchCliArgs(argv: readonly string[]): NeonBranchCliArgs {
  const args: NeonBranchCliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const currentArg = argv[index];

    if (currentArg === "--branch-id") {
      args.branchId = readFlagValue(argv, index, currentArg);
      index += 1;
      continue;
    }

    if (currentArg === "--name") {
      args.name = readFlagValue(argv, index, currentArg);
      index += 1;
      continue;
    }

    if (currentArg === "--ttl-hours") {
      args.ttlHours = Number(readFlagValue(argv, index, currentArg));
      index += 1;
      continue;
    }

    if (currentArg === "--max-age-hours") {
      args.maxAgeHours = Number(readFlagValue(argv, index, currentArg));
      index += 1;
      continue;
    }

    throw new Error(`Unsupported Neon branch flag: ${currentArg}`);
  }

  return args;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function readFlagValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}
