#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { loginCommand } from '../commands/login.js';
import { whoamiCommand } from '../commands/whoami.js';
import { logoutCommand } from '../commands/logout.js';
import { publishCommand } from '../commands/publish.js';

const program = new Command();

program
  .name('tank')
  .description('Security-first package manager for AI agent skills')
  .version('0.1.0');

program
  .command('init')
  .description('Create a new skills.json in the current directory')
  .action(initCommand);

program
  .command('login')
  .description('Authenticate with the Tank registry via browser')
  .action(async () => {
    try {
      await loginCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Login failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('whoami')
  .description('Show the currently logged-in user')
  .action(async () => {
    try {
      await whoamiCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Remove authentication token from config')
  .action(async () => {
    try {
      await logoutCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Logout failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('publish')
  .description('Pack and publish a skill to the Tank registry')
  .option('--dry-run', 'Validate and pack without uploading')
  .action(async (opts: { dryRun?: boolean }) => {
    try {
      await publishCommand({ dryRun: opts.dryRun });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Publish failed: ${msg}`);
      process.exit(1);
    }
  });

program.parse();
