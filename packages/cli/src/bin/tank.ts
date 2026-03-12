#!/usr/bin/env node
import { Command } from 'commander';
import { auditCommand } from '../commands/audit.js';
import { doctorCommand } from '../commands/doctor.js';
import { infoCommand } from '../commands/info.js';
import { initCommand } from '../commands/init.js';
import { installAll, installCommand } from '../commands/install.js';
import { linkCommand } from '../commands/link.js';
import { loginCommand } from '../commands/login.js';
import { logoutCommand } from '../commands/logout.js';
import { migrateCommand } from '../commands/migrate.js';
import { permissionsCommand } from '../commands/permissions.js';
import { publishCommand } from '../commands/publish.js';
import { removeCommand } from '../commands/remove.js';
import { scanCommand } from '../commands/scan.js';
import { searchCommand } from '../commands/search.js';
import { unlinkCommand } from '../commands/unlink.js';
import { updateCommand } from '../commands/update.js';
import { upgradeCommand } from '../commands/upgrade.js';
import { verifyCommand } from '../commands/verify.js';
import { whoamiCommand } from '../commands/whoami.js';
import { flushLogs } from '../lib/debug-logger.js';
import { checkForUpgrade } from '../lib/upgrade-check.js';
import { VERSION } from '../version.js';

const program = new Command();

program.name('tank').description('Security-first package manager for AI agent skills').version(VERSION);

program
  .command('init')
  .description('Create a new tank.json in the current directory')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .option('--name <name>', 'Skill name')
  .option('--skill-version <version>', 'Skill version (default: 0.1.0)')
  .option('--description <desc>', 'Skill description')
  .option('--private', 'Make skill private')
  .option('--force', 'Overwrite existing tank.json')
  .action(
    async (opts: {
      yes?: boolean;
      name?: string;
      skillVersion?: string;
      description?: string;
      private?: boolean;
      force?: boolean;
    }) => {
      try {
        await initCommand({
          yes: opts.yes,
          name: opts.name,
          version: opts.skillVersion,
          description: opts.description,
          private: opts.private,
          force: opts.force
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Init failed: ${msg}`);
        process.exit(1);
      }
    }
  );

program
  .command('login')
  .description('Authenticate with the Tank registry via browser')
  .action(async () => {
    try {
      await loginCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Login failed: ${msg}`);
      await flushLogs();
      process.exit(1);
    }
    await flushLogs();
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
  .alias('pub')
  .description('Pack and publish a skill to the Tank registry')
  .option('--dry-run', 'Validate and pack without uploading')
  .option('--private', 'Publish skill as private')
  .option('--visibility <mode>', 'Skill visibility (public|private)')
  .action(async (opts: { dryRun?: boolean; private?: boolean; visibility?: string }) => {
    try {
      await publishCommand({
        dryRun: opts.dryRun,
        private: opts.private,
        visibility: opts.visibility
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Publish failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('install')
  .alias('i')
  .description('Install a skill from the Tank registry, or all skills from lockfile')
  .argument('[name]', 'Skill name (e.g., @org/skill-name). Omit to install from lockfile.')
  .argument('[version-range]', 'Semver range (default: *)', '*')
  .option('-g, --global', 'Install skill globally (available to all projects)')
  .option('-y, --yes', 'Auto-accept permission budget expansion')
  .action(async (name: string | undefined, versionRange: string, opts: { global?: boolean; yes?: boolean }) => {
    try {
      if (name) {
        await installCommand({ name, versionRange, global: opts.global, yes: opts.yes });
      } else {
        await installAll({ global: opts.global, yes: opts.yes });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Install failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('remove')
  .aliases(['rm', 'r'])
  .description('Remove an installed skill')
  .argument('<name>', 'Skill name (e.g., @org/skill-name)')
  .option('-g, --global', 'Remove a globally installed skill')
  .action(async (name: string, opts: { global?: boolean }) => {
    try {
      await removeCommand({ name, global: opts.global });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Remove failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('update')
  .alias('up')
  .description('Update skills to latest versions within their ranges')
  .argument('[name]', 'Skill name to update (omit to update all)')
  .option('-g, --global', 'Update globally installed skills')
  .action(async (name: string | undefined, opts: { global?: boolean }) => {
    try {
      await updateCommand({ name, global: opts.global });
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
  .alias('perms')
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
  .alias('s')
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
  .alias('show')
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

program
  .command('scan')
  .description('Scan a local skill for security issues without publishing')
  .option('-d, --directory <path>', 'Directory to scan (default: current directory)')
  .action(async (opts: { directory?: string }) => {
    try {
      await scanCommand({ directory: opts.directory });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Scan failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('link')
  .alias('ln')
  .description('Link current skill directory to AI agent directories (for development)')
  .action(async () => {
    try {
      await linkCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Link failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('unlink')
  .description('Remove skill symlinks from AI agent directories')
  .action(async () => {
    try {
      await unlinkCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Unlink failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Diagnose agent integration health')
  .action(async () => {
    try {
      await doctorCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Doctor failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('migrate')
  .description('Migrate skills.json → tank.json and skills.lock → tank.lock')
  .action(async () => {
    try {
      await migrateCommand();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Migration failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('upgrade')
  .description('Update tank to the latest version')
  .argument('[version]', 'Target version (default: latest)')
  .option('--dry-run', 'Check for updates without installing')
  .option('--force', 'Reinstall even if already on the target version')
  .action(async (version: string | undefined, opts: { dryRun?: boolean; force?: boolean }) => {
    try {
      await upgradeCommand({ version, dryRun: opts.dryRun, force: opts.force });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Upgrade failed: ${msg}`);
      await flushLogs();
      process.exit(1);
    }
    await flushLogs();
  });

checkForUpgrade().catch(() => {});

program.parse();
