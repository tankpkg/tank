#!/usr/bin/env node
import { Command } from 'commander';

import { auditCommand } from '~/commands/audit.js';
import { buildCommand } from '~/commands/build.js';
import { doctorCommand } from '~/commands/doctor.js';
import { infoCommand } from '~/commands/info.js';
import { initCommand } from '~/commands/init.js';
import { installAll, installCommand, installFromUrl } from '~/commands/install.js';
import { linkCommand } from '~/commands/link.js';
import { loginCommand } from '~/commands/login.js';
import { logoutCommand } from '~/commands/logout.js';
import { migrateCommand } from '~/commands/migrate.js';
import { permissionsCommand } from '~/commands/permissions.js';
import { proxyCommand } from '~/commands/proxy.js';
import { publishCommand } from '~/commands/publish.js';
import { removeCommand } from '~/commands/remove.js';
import { runCommand } from '~/commands/run.js';
import { scanCommand } from '~/commands/scan.js';
import { searchCommand } from '~/commands/search.js';
import { unlinkCommand } from '~/commands/unlink.js';
import { updateCommand } from '~/commands/update.js';
import { upgradeCommand } from '~/commands/upgrade.js';
import { verifyCommand } from '~/commands/verify.js';
import { whoamiCommand } from '~/commands/whoami.js';
import { flushLogs } from '~/lib/debug-logger.js';
import { checkForUpgrade } from '~/lib/upgrade-check.js';
import { isUrl } from '~/lib/url-fetcher.js';
import { VERSION } from '~/version.js';

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
  .command('build <skill>')
  .description("Compile a skill's atoms for the detected (or specified) platform")
  .option('-p, --platform <platform>', 'Target platform (opencode, claude-code, cursor, windsurf, cline, roo-code)')
  .option('-o, --out <dir>', 'Output directory (default: current directory)')
  .option('--dry-run', 'Preview files without writing')
  .option('--list-platforms', 'List available platforms and exit')
  .action(
    async (skill: string, opts: { platform?: string; out?: string; dryRun?: boolean; listPlatforms?: boolean }) => {
      try {
        await buildCommand({
          skill,
          platform: opts.platform,
          out: opts.out,
          dryRun: opts.dryRun,
          listPlatforms: opts.listPlatforms
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Build failed: ${msg}`);
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
  .description('Install a skill from the Tank registry, a URL, or all skills from lockfile')
  .argument(
    '[name]',
    'Skill name or URL (e.g., @org/skill-name or https://github.com/owner/repo). Omit to install from lockfile.'
  )
  .argument('[version-range]', 'Semver range (default: *)', '*')
  .option('-g, --global', 'Install skill globally (available to all projects)')
  .option('-y, --yes', 'Auto-accept flagged scan verdicts')
  .option('--dangerously-no-tank-proxy', 'Skip wrapping MCP servers with the tank proxy (no scanning, no enforcement)')
  .action(
    async (
      name: string | undefined,
      versionRange: string,
      opts: { global?: boolean; yes?: boolean; dangerouslyNoTankProxy?: boolean }
    ) => {
      try {
        if (name && isUrl(name)) {
          await installFromUrl(name, {
            global: opts.global,
            yes: opts.yes,
            ...(opts.dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
          });
        } else if (name) {
          await installCommand({
            name,
            versionRange,
            global: opts.global,
            ...(opts.dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
          });
        } else {
          await installAll({
            global: opts.global,
            ...(opts.dangerouslyNoTankProxy ? { dangerouslyNoTankProxy: true } : {})
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Install failed: ${msg}`);
        process.exit(1);
      }
    }
  );

program
  .command('remove')
  .aliases(['rm', 'r', 'uninstall'])
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
  .command('run')
  .description('Launch an agent with credential protection (vault proxy)')
  .argument('<agent>', 'Agent ID to launch')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--verbose', 'Print verbose vault proxy details')
  .action(async (agent: string, opts: { verbose?: boolean }, cmd: Command) => {
    try {
      const agentArgs = cmd.args.slice(1);
      await runCommand({ agent, verbose: opts.verbose, agentArgs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Run failed: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('proxy')
  .description('Transparent MCP proxy — wraps an MCP server with runtime enforcement')
  .argument(
    '[command]',
    'Child MCP server command to wrap (omit when using --reset-pins, --remote, or download-ml-model)'
  )
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--audit-path <path>', 'JSONL audit log path (default: ~/.tank/proxy/audit.jsonl)')
  .option('--reset-pins', 'Delete all rug-pull schema pins under ~/.tank/proxy/pins/ and continue')
  .option('--remote <url>', 'Connect to a remote MCP server over SSE/HTTP instead of spawning a child')
  .option('--requires-auth', 'Require TANK_MCP_AUTH_<SLUG> env var before connecting to the remote')
  .option(
    '--enable-ml',
    'Enable the opt-in ML-based prompt-injection classifier (requires ~500MB model; run `tank proxy download-ml-model` first)'
  )
  .option('--verbose', 'Print proxy diagnostic details to stderr')
  .action(
    async (
      command: string | undefined,
      opts: {
        auditPath?: string;
        resetPins?: boolean;
        verbose?: boolean;
        remote?: string;
        requiresAuth?: boolean;
        enableMl?: boolean;
      },
      cmd: Command
    ) => {
      try {
        if (command === 'download-ml-model') {
          const { proxyDownloadMlCommand } = await import('~/commands/proxy-download-ml.js');
          const downloadOpts: Parameters<typeof proxyDownloadMlCommand>[0] = {};
          if (process.argv.includes('--yes') || process.argv.includes('-y')) downloadOpts.yes = true;
          await proxyDownloadMlCommand(downloadOpts);
          return;
        }
        if (opts.resetPins) {
          const { proxyResetPinsCommand } = await import('~/commands/proxy-reset-pins.js');
          proxyResetPinsCommand();
        }
        if (opts.remote) {
          const { proxyRemoteCommand } = await import('~/commands/proxy-remote.js');
          await proxyRemoteCommand({
            url: opts.remote,
            requiresAuth: opts.requiresAuth === true
          });
          return;
        }
        if (!command) return;
        const args = cmd.args.slice(1);
        const proxyOpts: Parameters<typeof proxyCommand>[0] = { command, args };
        if (opts.auditPath !== undefined) proxyOpts.auditPath = opts.auditPath;
        if (opts.verbose !== undefined) proxyOpts.verbose = opts.verbose;
        if (opts.enableMl === true) proxyOpts.enableMl = true;
        await proxyCommand(proxyOpts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Proxy failed: ${msg}`);
        process.exit(1);
      }
    }
  );

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
