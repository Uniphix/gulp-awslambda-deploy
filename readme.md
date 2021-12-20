# gulp-lambda-deploy
> Originally created by https://github.com/scottwrobinson/gulp-lambda-deploy in regards to deployment to lambda.  However since the code has not been updated in over 2 years, I couldn't wait to hopefully get a reply back about the most recent update to AWS Lambda SDK deployment that prevented me from deploying our lambda functions.

> So I took the code, transformed it into TypeScript and made type definitions for it.  Along with fixing the actual issue that prevented me from updating our software code on AWS.

# gulp-awslambda-deploy

> Gulp plugin to deploy zipped packages to AWS Lambda directly or via S3

## Install

```bash
$ npm install --save-dev gulp-awslambda-deploy
```

## Usage

`gulp-awslambda-deploy` accepts a single zip file, which is uploaded to AWS Lambda either directly or via S3. After upload, the zip file is passed down the stream. I suggest using [gulp-zip](https://github.com/sindresorhus/gulp-zip) to create the zip file.

Here is the typical usage:

```js
const gulp = require('gulp');
const lambda = require('gulp-awslambda-deploy');
const zip = require('gulp-zip');

let params = {
    name: '...',
    role: '...',
    s3: {
        bucket: '...',
        key: '...'
    },
    subnets: [..., ...],
    securityGroups: '...'
};

let options = {
    profile: '...',
    region: '...'
};

gulp.task('default', function(cb) {
    return gulp.src('index.js')
        .pipe(zip('package.zip'))
        .pipe(lambda(params, options))
        .on('end', cb);
});
```

If the `params.s3` object is not provided, then the zip file is uploaded directly to Lambda and is not stored in S3 as an intermediate step.

If a function with the name given in `params.name` does not already exist, then it is created, otherwise the existing code and configuration is updated for that function.

For more information on `params` and `options` see the [API section](#api).

#### AWS Credentials

Currently you must provide an AWS profile name that is stored in the Shared Credentials File at `~/.aws/credentials`. For more info see the [aws-sdk documentation](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

## API

`gulp-awslambda-deploy` must be given exactly two arguments. The first is Lambda-specific parameters, and the second is options for AWS. Each has its own set of optional and required properties.

```js
lambda(params, options);
```

### `params`

These parameters are specific to the Lambda function you're uploading.

#### `name` (required)
The name of your function.

#### `role` (required)
The ARN of the role given to the Lambda function.

#### `s3`
An object indicating where to upload the function code to. If the `s3` parameter is given, it must contain the properties `bucket` and `key`. These specify the upload location for the file within S3.

#### `handler`
The location of your method handler. Must be of the form `[filename].[method name]` where `[method name]` is exported. Defaults to `index.handler`.

#### `runtime`
The runtime for your code. Defaults to `nodejs4.3`.

#### `publish`
A boolean indidcating if you want to publish a new version of the function.

#### `alias`
The name of an alias to point to this function. If this alias doesn't already exist, it will be created.

#### `description`
A string describing the Lambda function.

#### `timeout`
The time in seconds that the function is allowed to run on each invocation.

#### `memory`
The amount of memory, in MB, your Lambda function is given.

#### `subnets`
The ids of subnets to create the Lambda function into, if you want to create it in a VPC (a string or an array of strings).

#### `securityGroups`
The security groups to add to the Lambda function if created in a VPC (a string or an array of strings).

### `options`

Options for configuring the AWS environment.

#### `profile` (required)
The named AWS profile used to authenticate and interact with AWS services. Must be saved in Shared Credentials File. See the [AWS Credentials](#aws-credentials) section.

#### `region` (required)
The AWS region your resources will be located in.