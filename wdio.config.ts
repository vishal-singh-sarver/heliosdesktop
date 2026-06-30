import { join } from 'node:path'
import type { Options } from '@wdio/types'

// VS Code and other Electron-based hosts set ELECTRON_RUN_AS_NODE=1 in their environment.
// Child processes inherit this, causing the Electron binary to run as Node.js instead of
// launching the app. Delete it here before wdio spawns ChromeDriver + Electron.
delete process.env['ELECTRON_RUN_AS_NODE']

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath: string = require('electron')

export const config: Options.Testrunner = {
  runner: 'local',

  // E2E specs — separate from Vitest unit tests
  specs: ['./e2e/tests/**/*.test.ts'],
  exclude: [],

  // Electron only supports a single instance
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // appEntryPoint is converted to --app=<path> by the service; no need for appBinaryPath
        appEntryPoint: join(process.cwd(), 'out', 'main', 'index.js'),
        // Required on Linux: Chromium sandbox needs setuid root; pass flags before entry point
        appArgs: process.platform === 'linux'
          ? ['--no-sandbox', '--disable-dev-shm-usage']
          : [],
      },
    },
  ],

  logLevel: 'debug',

  // Stop after N failures (0 = never stop early)
  bail: 0,

  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: ['electron'],

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    // Heavy real-file imports (e.g. NSRDB NLR*.csv at 8784 rows) revalidate every
    // row in the renderer on each mapping interaction; 60s is too tight under load.
    timeout: 120000,
  },
}
