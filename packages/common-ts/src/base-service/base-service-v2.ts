/* Imports: External */
import Config from 'bcfg'
import * as dotenv from 'dotenv'
import { Command, Option } from 'commander'
import { ValidatorSpec, cleanEnv } from 'envalid'
import { sleep } from '@eth-optimism/core-utils'

/* Imports: Internal */
import { Logger } from '../common/logger'

export type Options = {
  [key: string]: any
}

export type OptionsSpec<TOptions extends Options> = {
  [P in keyof TOptions]: ValidatorSpec<TOptions[P]>
}

/**
 * BaseServiceV2 is an advanced but simple base class for long-running TypeScript services.
 */
export abstract class BaseServiceV2<TOptions extends Options, TServiceState> {
  /**
   * Whether or not the service will loop.
   */
  protected loop: boolean

  /**
   * Waiting period in ms between loops, if the service will loop.
   */
  protected loopIntervalMs: number

  /**
   * Logger class for this service.
   */
  protected logger: Logger

  /**
   * Service state, persisted between loops.
   */
  protected state: TServiceState

  /**
   * Service options.
   */
  protected readonly options: TOptions

  /**
   * @param params Options for the construction of the service.
   * @param params.name Name for the service. This name will determine the prefix used for logging,
   * metrics, and loading environment variables.
   * @param params.optionsSpec Settings for input options. You must specify at least a
   * description for each option.
   * @param params.options Options to pass to the service.
   * @param params.loops Whether or not the service should loop. Defaults to true.
   * @param params.loopIntervalMs Loop interval in milliseconds. Defaults to zero.
   */
  constructor(params: {
    name: string
    optionsSpec: OptionsSpec<TOptions>
    options?: Partial<TOptions>
    loop?: boolean
    loopIntervalMs?: number
  }) {
    this.loop = params.loop !== undefined ? params.loop : true
    this.loopIntervalMs =
      params.loopIntervalMs !== undefined ? params.loopIntervalMs : 0
    this.state = {} as TServiceState

    // Use commander as a way to communicate info about the service. We don't actually *use*
    // commander for anything besides the ability to run `ts-node ./service.ts --help`.
    const program = new Command()
    for (const [optionName, optionSpec] of Object.entries(params.optionsSpec)) {
      program.addOption(
        new Option(`--${optionName.toLowerCase()}`, `${optionSpec.desc}`).env(
          `${params.name
            .replace(/-/g, '_')
            .toUpperCase()}__${optionName.toUpperCase()}`
        )
      )
    }

    // Load all configuration values from the environment and argv.
    program.parse()
    dotenv.config()
    const config = new Config(params.name)
    config.load({
      env: true,
      argv: true,
    })

    // Clean configuration values using the options spec.
    // Since BCFG turns everything into lower case, we're required to turn all of the input option
    // names into lower case for the validation step. We'll turn the names back into their original
    // names when we're done.
    const cleaned = cleanEnv<TOptions>(
      { ...config.env, ...config.args },
      Object.entries(params.optionsSpec || {}).reduce((acc, [key, val]) => {
        acc[key.toLowerCase()] = val
        return acc
      }, {}) as any,
      Object.entries(params.options || {}).reduce((acc, [key, val]) => {
        acc[key.toLowerCase()] = val
        return acc
      }, {}) as any
    )

    // Turn the lowercased option names back into camelCase.
    this.options = Object.keys(params.optionsSpec || {}).reduce((acc, key) => {
      acc[key] = cleaned[key.toLowerCase()]
      return acc
    }, {}) as TOptions

    this.logger = new Logger({ name: params.name })
  }

  /**
   * Runs the main function. If this service is set up to loop, will repeatedly loop around the
   * main function. Will also catch unhandled errors.
   */
  public run(): void {
    const _run = async () => {
      if (this.init) {
        this.logger.info('initializing service')
        await this.init()
        this.logger.info('service initialized')
      }

      if (this.loop) {
        this.logger.info('starting main loop')
        while (true) {
          try {
            await this.main()
          } catch (err) {
            this.logger.error('caught an unhandled exception', {
              message: err.message,
              stack: err.stack,
              code: err.code,
            })
          }

          // Always sleep between loops
          await sleep(this.loopIntervalMs)
        }
      } else {
        this.logger.info('running main function')
        await this.main()
      }
    }

    _run()
  }

  /**
   * Initialization function. Runs once before the main function.
   */
  protected init?(): Promise<void>

  /**
   * Main function. Runs repeatedly when run() is called.
   */
  protected abstract main(): Promise<void>
}
