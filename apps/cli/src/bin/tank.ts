#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('tank')
  .description('Security-first package manager for AI agent skills')
  .version('0.1.0');

// Commands will be added in subsequent tasks

program.parse();
