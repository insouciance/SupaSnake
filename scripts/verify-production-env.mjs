#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import validation from './production-env-validation.cjs';

const { validateProductionEnvironment } = validation;

function parseArguments(argv) {
  const options = {
    allowSealed: false,
    envFile: null,
    paymentsMode: 'test',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-sealed') {
      options.allowSealed = true;
    } else if (argument === '--env-file') {
      options.envFile = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === '--payments-mode') {
      options.paymentsMode = argv[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!['test', 'live'].includes(options.paymentsMode)) {
    throw new Error('--payments-mode must be either test or live');
  }
  return options;
}

function parseEnv(source) {
  const parsed = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const environment = { ...process.env };
  if (options.envFile) {
    try {
      Object.assign(
        environment,
        parseEnv(readFileSync(options.envFile, 'utf8'))
      );
    } catch (error) {
      console.error(
        `Unable to read production environment file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exitCode = 2;
      return;
    }
  }

  const { errors, warnings, sealed } = validateProductionEnvironment(
    environment,
    options.paymentsMode,
    { allowSealed: options.allowSealed }
  );
  for (const warning of warnings) console.warn(`WARNING ${warning}`);
  if (errors.length > 0) {
    console.error('Production environment validation failed:');
    for (const error of errors) console.error(`- ${error}`);
    console.error('No secret values were printed.');
    process.exitCode = 1;
    return;
  }

  const sealedNote = sealed.length
    ? ` ${sealed.length} sealed values passed presence checks and require cloud-build validation.`
    : '';
  console.log(
    `Production environment validated (${options.paymentsMode} payments; no values printed).${sealedNote}`
  );
}

main();
