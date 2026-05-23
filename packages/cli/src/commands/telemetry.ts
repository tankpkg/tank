import { logger } from '~/lib/logger.js';
import { captureEvent, describeTelemetryState, getTelemetryStatus, setTelemetry } from '~/lib/telemetry.js';

export type TelemetryAction = 'on' | 'off' | 'status';

export interface TelemetryOptions {
  action: TelemetryAction;
  configDir?: string;
}

export async function telemetryCommand(opts: TelemetryOptions): Promise<void> {
  const { action, configDir } = opts;

  if (action === 'status') {
    logger.info(describeTelemetryState(configDir));
    return;
  }

  if (action === 'on') {
    setTelemetry(true, configDir);
    const status = getTelemetryStatus(configDir);
    if (status.reason === 'onprem') {
      logger.warn('Telemetry config written, but disabled because TANK_MODE=selfhosted.');
      return;
    }
    if (status.reason === 'no-key') {
      logger.warn('Telemetry config written, but this build has no telemetry key compiled in.');
      return;
    }
    captureEvent({ event: 'cli_opted_in' }, configDir);
    logger.info('Telemetry: enabled. Thanks for helping improve Tank.');
    logger.info('Disable any time: tank telemetry off');
    return;
  }

  if (action === 'off') {
    captureEvent({ event: 'cli_opted_out' }, configDir);
    setTelemetry(false, configDir);
    logger.info('Telemetry: disabled.');
    return;
  }

  logger.error(`Unknown telemetry action: ${action}. Use on | off | status.`);
  process.exitCode = 1;
}
