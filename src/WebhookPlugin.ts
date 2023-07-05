import Serverless, { Options } from 'serverless';
import SlsPlugin, { VariableResolvers } from 'serverless/classes/Plugin';
import { Builder } from './Builder';

export class WebhookPlugin implements SlsPlugin {
  public hooks: SlsPlugin.Hooks;

  protected builder: Builder;

  configurationVariablesSources?: Record<string,any>;;
  variableResolvers?: VariableResolvers;

  constructor(
    public readonly serverless: Serverless,
    public readonly options: Options,
  ) {
    this.builder = new Builder(this.serverless);
    this.hooks = {
      'initialize': this.initialize.bind(this),
      'after:package:compileEvents': this.afterPackageCompileEvents.bind(this),
    };

    this.configurationVariablesSources = {
      webhooks: {
        resolve: this.resolveReference.bind(this)
      },
    };
  }

  async resolveReference({ address }: { address: string }): Promise<{ value: any }> {
    return this.builder.resolveVariable(address);
  }

  protected initialize(): void {
    this.builder.initConfig();
    this.builder.createStack();
    this.builder.resolveLazyVariables();
  }

  protected afterPackageCompileEvents(): void {
    this.builder.appendCloudformationResources();
  }
}
