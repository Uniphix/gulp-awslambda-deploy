/// <reference types="aws-sdk" />

declare global {
    type AWSLambdaDeployParams = {
        functionName: AWS.Lambda.FunctionName
        role: AWS.Lambda.RoleArn
        s3?: {
            bucket: AWS.S3.BucketName
            key: AWS.S3.ObjectKey
        }
        alias?: AWS.Lambda.Alias
        publish?: boolean
        file?: any

        handler?: string
        runtime?: AWS.Lambda.Runtime
        memory?: AWS.Lambda.MemorySize

        description?: string
        timeout?: AWS.Lambda.Timeout

        subnets?: AWS.Lambda.SubnetIds
        securityGroups?: AWS.Lambda.SecurityGroupIds
    }

    type AWSLambdaDeployOptions = {
        region: string
        profile: string
    }
}

declare function GulpMainFunction(params: AWSLambdaDeployParams, options: AWSLambdaDeployOptions) : NodeJS.WritableStream;
export = GulpMainFunction;