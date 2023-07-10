import { App, DefaultStackSynthesizer, DefaultTokenResolver, Fn, Lazy, Stack, StringConcat, Tokenization } from "aws-cdk-lib";
import { CfnIntegration, CfnRoute } from "aws-cdk-lib/aws-apigatewayv2";
import { EventBus } from "aws-cdk-lib/aws-events";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CloudFormationTemplate } from "aws-cdk-lib/aws-servicecatalog";
import { merge, get, omit  } from "lodash";
import Serverless from "serverless";
import Aws from "serverless/plugins/aws/provider/awsProvider";

interface SingleWebhookConfig {
    route: {
        method: string,
        path: string
    },
    source: string,
    detailType: string,
    detail: string,
}

interface WebhooksConfig {
    [name: string]: SingleWebhookConfig,
}

export class Builder {
    private app: App;
    protected stack: Stack;
    protected region: string;
    protected stackName: string;
    protected readonly awsProvider: Aws;
    protected config?: WebhooksConfig;
    protected readonly naming: { [key: string]: (param?: string) => string };   

    protected bus?: EventBus;
    protected apiGatewayRole?: Role;

    constructor(
        protected readonly serverless: Serverless
    ) {
        this.awsProvider = serverless.getProvider("aws");
        this.stackName = this.awsProvider.naming.getStackName();
        this.app = new App();
        this.stack = new Stack(this.app, undefined, {
            synthesizer: new DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
            }),
        });
        this.naming = this.awsProvider.naming;
        this.region = this.awsProvider.getRegion();
    }
    public initConfig(): void
    {
        this.config = get(this.serverless.service, 'custom.webhooks') as WebhooksConfig;
    }

    public createStack(): void
    {
        if (!this.config) {
            return;
        }

        this.createSharedResources();

        for (let [key, config] of Object.entries(this.config)) {
            this.createSingleWebhookResources(config, key);
        }
    }

    protected buildResourceName(name: string): string
    {
        return `${this.stackName}-${name}`;
    }

    protected createSharedResources(): void {
        // this.api = new CfnHttpApi(this.stack, 'HttpApi');
        let busId = this.naming.getEventBridgeEventBusLogicalId('Webhooks');
        this.bus = new EventBus(this.stack, busId, {
            eventBusName: this.buildResourceName(busId),
        });
        this.apiGatewayRole = new Role(this.stack, 'WebhooksApiGatewayRole', {
            assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
            inlinePolicies: {
                EventBridge: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ["events:PutEvents"],
                            resources: [this.bus.eventBusArn],
                        }),
                    ],
                }),
            },
        });
    }

    protected getApiId(): string {
        return Fn.ref(this.naming.getHttpApiLogicalId());
    }

    protected createSingleWebhookResources(config: SingleWebhookConfig, key: string) {
        let IntegrationId = this.naming.getHttpApiIntegrationLogicalId(key);
        let RouteId = this.naming.getHttpApiRouteLogicalId(key);

        const eventBridgeIntegration = new CfnIntegration(this.stack, IntegrationId, {
            apiId: this.getApiId(),
            connectionType: "INTERNET",
            credentialsArn: this.apiGatewayRole?.roleArn,
            integrationSubtype: "EventBridge-PutEvents",
            integrationType: "AWS_PROXY",
            payloadFormatVersion: "1.0",
            requestParameters: {
                DetailType: config.detailType,
                Detail: config.detail,
                Source: config.source,
                EventBusName: this.bus?.eventBusName,
            },
        });
        const route = new CfnRoute(this.stack, RouteId, {
            apiId: this.getApiId(),
            routeKey: `${config.route.method} ${config.route.path}`,
            target: Fn.join("/", ["integrations", eventBridgeIntegration.ref]),
            authorizationType: "NONE",
        });
    }

    public appendCloudformationResources(): void {
        let resources = omit(this.app.synth().getStackByName(this.stack.stackName).template, 'Transform') as CloudFormationTemplate;

        merge(this.serverless.service, {
            resources,
        });
    }

    public resolveVariable(address: string): { value: any } {
        return {
            value: Lazy.any({
                produce: () => {
                    if (address == 'eventBus') {
                        return this.bus?.eventBusName;
                    }
                    throw new Error(`variable \`${address}\` not found`);
                }
            }).toString(),
        };
    }

    public resolveLazyVariables() {
        // Use the CDK token resolver to resolve all lazy variables in the template
        const tokenResolver = new DefaultTokenResolver(new StringConcat());
        const resolveTokens = <T>(input: T): T => {
            if (input === undefined) {
                return input;
            }
    
            return Tokenization.resolve(input, {
                resolver: tokenResolver,
                scope: this.stack,
            }) as T;
        };
        // this.serverless.service.provider = resolveTokens(this.serverless.service.provider);
        // this.serverless.service.package = resolveTokens(this.serverless.service.package);
        // this.serverless.service.custom = resolveTokens(this.serverless.service.custom);
        // this.serverless.service.resources = resolveTokens(this.serverless.service.resources);
        this.serverless.service.functions = resolveTokens(this.serverless.service.functions);
        // this.serverless.service.layers = resolveTokens(this.serverless.service.layers);
        // this.serverless.service.outputs = resolveTokens(this.serverless.service.outputs);
        // Also resolve tokens in `configurationInput` because they also appear in there
        // this.serverless.configurationInput = resolveTokens(this.serverless.configurationInput);
    }
}