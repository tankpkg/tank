#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { loginCommand } from '../commands/login.js';
import { whoamiCommand } from '../commands/whoami.js';
import { logoutCommand } from '../commands/logout.js';
import { publishCommand } from '../commands/publish.js';
import { installCommand, installAll } from '../commands/install.js';
import { removeCommand } from '../commands/remove.js';
import { updateCommand } from '../commands/update.js';
import { verifyCommand } from '../commands/verify.js';
import { permissionsCommand } from '../commands/permissions.js';
import { searchCommand } from '../commands/search.js';
import { infoCommand } from '../commands/info.js';
import { auditCommand } from '../commands/audit.js';

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

program
  .command('install')
  .description('Install a skill from the Tank registry, or all skills from lockfile')
  .argument('[name]', 'Skill name (e.g., @org/skill-name). Omit to install from lockfile.')
  .argument('[version-range]', 'Semver range (default: *)', '*')
  .action(async (name: string | undefined, versionRange: string) => {
    try {
      if (name) {
        await installCommand({ name, versionRange });
      } else {
        await installAll({});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Install failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove an installed skill')
  .argument('<name>', 'Skill name (e.g., @org/skill-name)')
  .action(async (name: string) => {
    try {
      await removeCommand({ name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Remove failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update skills to latest versions within their ranges')
  .argument('[name]', 'Skill name to update (omit to update all)')
  .action(async (name: string | undefined) => {
    try {
      await updateCommand({ name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Update failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify installed skills match the lockfile')
  .action(async () => {
    try {
      await verifyCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Verify failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('permissions')
  .description('Display resolved permission summary for installed skills')
  .action(async () => {
    try {
      await permissionsCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search for skills in the Tank registry')
  .argument('<query>', 'Search query')
  .action(async (query: string) => {
    try {
      await searchCommand({ query });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Search failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show detailed information about a skill')
  .argument('<name>', 'Skill name (e.g., @org/skill-name)')
  .action(async (name: string) => {
    try {
      await infoCommand({ name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Info failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Display security audit results for installed skills')
  .argument('[name]', 'Skill name to audit (omit to audit all)')
  .action(async (name: string | undefined) => {
    try {
      await auditCommand({ name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Audit failed: ${msg}`);
      process.exit(1);
    }
  });

program.parse();
