# Serverless Webhooks Plugin

This is a plugin to expand the [Serverless Framework](https://www.serverless.com/) with webhooks

## Installation

```
serverless plugin install --name serverless-webhooks
```

## Quick start

Once installed, define you webhooks in serverless.yml

```yml
service: my-app

provider:
  name: aws

plugins:
  - serverless-webhooks

functions:
  zuora-consumer:
    handler: src/zuora-consumer.handler
    events:
      - eventBridge:
          eventBus: ${webhooks:eventBus}
          pattern:
            source:
              - zuora
            detail-type:
              - workflow_GET_example.finished
              - workflow_POST_example.finished
custom:
  webhooks:
    zuoraWorkflowGetExampleFinished:
      route:  
        method: GET
        path: /webhooks/zuora/workflow_GET_example.finished
      source: zuora
      detailType: workflow_GET_example.finished
      detail: $request.querystring.detail
    zuoraWorkflowPostExampleFinished:
      route:  
        method: POST
        path: /webhooks/zuora/workflow_POST_example.finished
      source: zuora
      detailType: workflow_POST_example.finished
      detail: $request.body
```

## How it works

This configuration will create:
- A shared event bus (referenced in the variable `${webhooks:eventBus}`).
- 2 routes (without an authorizer) in the default API Gateway as follows:
  1. `GET /webhooks/zuora/workflow_GET_example.finished`, which will receive the event **detail** from the query string parameter named `detail`.
  2. `POST /webhooks/zuora/workflow_POST_example.finished`, which will receive the event **detail** from the body of the request.
- The `zuora-consumer` function will be triggered by any event with the **source** `zuora` and **detailType** `workflow_GET_example.finished` or `workflow_POST_example.finished`.

## Issues
Feel free to open any relevant issue on [Github](https://github.com/franc-liuzzi/serverless-webhooks/issues).