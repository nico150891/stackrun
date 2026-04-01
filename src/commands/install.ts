import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { fetchManifest } from '../services/registry.js';
import { readToolManifest, saveToolManifest } from '../services/storage.js';
import { validateManifest, formatValidationErrors } from '../services/validator.js';

export const installCommand = new Command('install')
  .description('Install a tool from the registry')
  .argument('<tool>', 'Tool name to install')
  .option('--force', 'Overwrite if already installed')
  .addHelpText(
    'after',
    `
Examples:
  $ stackrun install stripe          # install from registry
  $ stackrun install stripe --force  # reinstall/update`,
  )
  .action(async (tool: string, options: { force?: boolean }) => {
    // Check if already installed
    if (!options.force) {
      const existing = await readToolManifest(tool);
      if (existing) {
        console.error(chalk.yellow(`Tool "${tool}" is already installed (v${existing.version}).`));
        console.error(chalk.yellow('Use --force to overwrite.'));
        process.exitCode = 1;
        return;
      }
    }

    const spinner = ora(`Fetching "${tool}" from registry...`).start();

    try {
      const manifest = await fetchManifest(tool);
      spinner.text = `Validating "${tool}" manifest...`;

      // Validate manifest
      const errors = validateManifest(manifest as unknown as Record<string, unknown>);
      if (errors.length > 0) {
        spinner.fail(`Invalid manifest for "${tool}"`);
        console.error(chalk.red('Validation errors:'));
        for (const line of formatValidationErrors(errors)) {
          console.error(chalk.red(line));
        }
        process.exitCode = 1;
        return;
      }

      spinner.text = `Installing "${tool}"...`;
      await saveToolManifest(manifest);
      spinner.succeed(
        `Installed ${chalk.cyan(tool)} v${manifest.version} (${manifest.commands.length} command${manifest.commands.length !== 1 ? 's' : ''})`,
      );
    } catch (err) {
      spinner.fail(`Failed to install "${tool}"`);
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: ${message}`));
      process.exitCode = 2;
    }
  });
