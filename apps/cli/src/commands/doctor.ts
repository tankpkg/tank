import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { detectInstalledAgents, getGlobalSkillsDir, getSupportedAgents } from '../lib/agents.js';
import { getSkillLinkStatus, type AgentLinkStatus } from '../lib/linker.js';
import { readGlobalLinks } from '../lib/links.js';

export interface DoctorOptions {
  directory?: string;
  homedir?: string;
}

interface SkillStatusSummary {
  statusText: string;
  issues: string[];
}

const parseLockKey = (key: string): string => {
  const lastAt = key.lastIndexOf('@');
  if (lastAt > 0) {
    return key.slice(0, lastAt);
  }
  return key;
};

const getExtractDir = (baseDir: string, skillName: string): string => {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(baseDir, scope, name);
  }
  return path.join(baseDir, skillName);
};

const formatAgents = (agents: AgentLinkStatus[], label: string): string => {
  if (agents.length === 0) {
    return `${label}`;
  }
  return `${label} (${agents.map(agent => agent.agentName).join(', ')})`;
};

const summarizeStatus = (
  skillName: string,
  statuses: AgentLinkStatus[],
  extractExists: boolean,
  scope: 'local' | 'global' | 'dev',
): SkillStatusSummary => {
  if (statuses.length === 0) {
    return {
      statusText: chalk.yellow('⚠️ no agents detected'),
      issues: [],
    };
  }

  const brokenAgents = statuses.filter(status => status.linked && !status.targetValid);
  const linkedAgents = statuses.filter(status => status.linked && status.targetValid);

  if (brokenAgents.length > 0) {
    const base = chalk.yellow('⚠️ broken link');
    const text = formatAgents(brokenAgents, base);
    const command = scope === 'dev'
      ? `Run \`tank link\` in the skill directory to fix ${skillName}`
      : `Run \`tank install ${skillName}\` to fix broken link`;
    return {
      statusText: text,
      issues: [command],
    };
  }

  if (linkedAgents.length > 0) {
    if (!extractExists && scope !== 'dev') {
      return {
        statusText: chalk.yellow('⚠️ missing extract'),
        issues: [`Run \`tank install ${skillName}\` to install missing extract`],
      };
    }
    const text = formatAgents(linkedAgents, chalk.green('✅ linked'));
    return { statusText: text, issues: [] };
  }

  if (!extractExists && scope !== 'dev') {
    return {
      statusText: chalk.yellow('⚠️ missing extract'),
      issues: [`Run \`tank install ${skillName}\` to install missing extract`],
    };
  }

  return {
    statusText: chalk.red('❌ not linked'),
    issues: [],
  };
};

const printSectionHeader = (title: string): void => {
  console.log(`\n${chalk.bold(title)}:`);
};

export async function doctorCommand(options?: DoctorOptions): Promise<void> {
  try {
    const directory = options?.directory ?? process.cwd();
    const homedir = options?.homedir ?? os.homedir();

    const supportedAgents = getSupportedAgents(homedir);
    const installedAgents = detectInstalledAgents(homedir);
    const installedIds = new Set(installedAgents.map(agent => agent.id));

    const skillsJsonPath = path.join(directory, 'skills.json');
    const localSkills = fs.existsSync(skillsJsonPath)
      ? Object.keys(JSON.parse(fs.readFileSync(skillsJsonPath, 'utf-8')).skills ?? {})
      : [];
    localSkills.sort();

    const globalLockPath = path.join(homedir, '.tank', 'skills.lock');
    const globalSkills = fs.existsSync(globalLockPath)
      ? Object.keys(JSON.parse(fs.readFileSync(globalLockPath, 'utf-8')).skills ?? {}).map(parseLockKey)
      : [];
    const uniqueGlobal = Array.from(new Set(globalSkills)).sort();

    const globalLinks = readGlobalLinks(homedir);
    const devLinks = Object.entries(globalLinks.links)
      .filter(([, entry]) => entry.source === 'dev')
      .map(([skillName]) => skillName)
      .sort();

    const suggestions = new Set<string>();

    console.log(chalk.bold('Tank Doctor Report'));
    console.log(chalk.bold('=================='));

    printSectionHeader('Detected Agents');
    for (const agent of supportedAgents) {
      const installed = installedIds.has(agent.id);
      const icon = installed ? chalk.green('✅') : chalk.red('❌');
      const details = installed ? agent.skillsDir : chalk.gray('(not found)');
      console.log(`  ${icon} ${agent.name}    ${details}`);
    }

    if (installedAgents.length === 0) {
      suggestions.add('No agents detected. Install an AI agent to enable skill linking.');
    }

    const localLinksDir = path.join(directory, '.tank');
    printSectionHeader(`Local Skills (${localSkills.length})` + `:                          [project: ${directory}]`);
    if (localSkills.length === 0) {
      console.log('  none');
    }
    for (const skillName of localSkills) {
      const extractDir = getExtractDir(path.join(directory, '.tank', 'skills'), skillName);
      const extractExists = fs.existsSync(extractDir);
      const statuses = getSkillLinkStatus({ skillName, linksDir: localLinksDir, homedir });
      const summary = summarizeStatus(skillName, statuses, extractExists, 'local');
      summary.issues.forEach(issue => suggestions.add(issue));
      console.log(`  ${skillName}  ${summary.statusText}`);
    }

    const globalLinksDir = path.join(homedir, '.tank');
    const globalSkillsDir = getGlobalSkillsDir(homedir);
    printSectionHeader(`Global Skills (${uniqueGlobal.length})` + `:                         [${globalSkillsDir}]`);
    if (uniqueGlobal.length === 0) {
      console.log('  none');
    }
    for (const skillName of uniqueGlobal) {
      const extractDir = getExtractDir(globalSkillsDir, skillName);
      const extractExists = fs.existsSync(extractDir);
      const statuses = getSkillLinkStatus({ skillName, linksDir: globalLinksDir, homedir });
      const summary = summarizeStatus(skillName, statuses, extractExists, 'global');
      summary.issues.forEach(issue => suggestions.add(issue));
      console.log(`  ${skillName}  ${summary.statusText}`);
    }

    printSectionHeader(`Dev Links (${devLinks.length})` + ':                             [tank link]');
    if (devLinks.length === 0) {
      console.log('  none');
    }
    for (const skillName of devLinks) {
      const statuses = getSkillLinkStatus({ skillName, linksDir: globalLinksDir, homedir });
      const summary = summarizeStatus(skillName, statuses, true, 'dev');
      summary.issues.forEach(issue => suggestions.add(issue));
      console.log(`  ${skillName}  ${summary.statusText}`);
    }

    if (localSkills.length === 0 && uniqueGlobal.length === 0 && devLinks.length === 0) {
      suggestions.add('Run `tank install @tank/typescript` to add your first skill');
    }

    printSectionHeader('Suggestions');
    if (suggestions.size === 0) {
      console.log('  none');
    } else {
      for (const suggestion of suggestions) {
        console.log(`  • ${suggestion}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`Doctor report failed: ${message}`));
    console.log('Suggestions:');
    console.log('  • Run `tank install @tank/typescript` to add your first skill');
  }
}
