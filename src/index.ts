import AWS = require('aws-sdk');
import gutil = require('gulp-util');
import through = require('through2');

type Params = AWSLambdaDeployParams;
type Options = AWSLambdaDeployOptions;

const DEFAULT_PARAMS = {
    handler: 'index.handler',
    runtime: 'nodejs14.x'
};

let gulpError = function (message: string) {
    return new gutil.PluginError('gulp-lambda-deploy', message);
};

const main = (params: Params, options: Options) => {
    if (!params) throw gulpError('No parameters provided');
    if (!params.functionName) throw gulpError('No Lambda function name provided');
    if (!params.role) throw gulpError('No Lambda role provided');
    if (!options) throw gulpError('No AWS options provided');
    if (!options.region) throw gulpError('No AWS region provided');
    if (!options.profile) throw gulpError('No AWS profile provided');

    if (params.s3) {
        if (!params.s3.bucket) throw gulpError('If uploading via S3, a bucket must be provided');
        if (!params.s3.key) throw gulpError('If uploading via S3, a key must be provided');
    }

    if (params.alias && !params.publish) {
        throw gulpError('An alias was provided but \'publish\' was \'false\'.');
    }

    AWS.config.credentials = new AWS.SharedIniFileCredentials({
        profile: options.profile
    });

    const s3 = new AWS.S3({
        region: options.region
    });

    const lambda = new AWS.Lambda({
        region: options.region
    });

    const transform = function (file: any, enc: BufferEncoding, cb: Function) {
        if (file.isNull()) {
            return cb();
        }

        if (file.isStream()) {
            throw gulpError('Stream content is not supported');
        }

        params.file = file;
        cb();
    };

    const flush = function (cb: Function) {
        gutil.log('Uploading Lambda function "' + params.functionName + '"...');

        let stream = this;
        let done = function (err?: Error) {
            if (err) return cb(gulpError(err.message));
            gutil.log('Lambda function "' + params.functionName + '" successfully uploaded');
            stream.push(params.file);
            cb();
        };

        if (!params.file) {
            return cb(gulpError('No code provided'));
        }

        if (params.file.path.slice(-4) !== '.zip') {
            return cb(gulpError('Given file is not a zip'));
        }

        Promise.resolve().then(function () {
            if (params.s3) {
                // Upload Lambda code via S3
                return s3upload(s3, params);
            }
        }).then(function () {
            // Check if function already exists...
            return hasLambdaFunction(lambda, params.functionName);
        }).then(function (hasFunction: boolean) {
            if (hasFunction) {
                // ...if it does, then update code/config...
                return updateFunctionCode(lambda, params)
                    .then(() => waitForFunctionUpdated(lambda, params))
                    .then(() => updateFunctionConfiguration(lambda, params));
            }
            // ...if it doesn't, then create it
            return createFunction(lambda, params);
        }).then(function (upsertedFunction: any) {
            if (params.alias) {
                return upsertAlias(lambda, upsertedFunction.Version, params);
            }
        }).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    };

    return through.obj(transform, flush);
};

function s3upload(s3: AWS.S3, params: Params) {
    return new Promise(function (resolve, reject) {
        const s3params = {
            Bucket: params.s3.bucket,
            Key: params.s3.key,
            Body: params.file.contents
        };

        s3.putObject(s3params, function (err, data) {
            if (err) reject(err);
            resolve(data);
        });
    });
}

async function hasLambdaFunction(lambda: AWS.Lambda, targetFunction: string) {
    return lambda.listFunctions({}).promise()
        .then(res => res.Functions)
        .then(functions => {
            for (let i = 0; i < functions.length; i++) {
                if (functions[i].FunctionName === targetFunction) {
                    return true;
                }
            }
            return false;
        });
}

async function waitForFunctionUpdated(lambda: AWS.Lambda, params: Params) {
    return lambda.waitFor('functionUpdated', {
        FunctionName: params.functionName
    }).promise();
}

async function updateFunctionCode(lambda: AWS.Lambda, params: Params) {
    // We give the 'publish' param to this method and NOT
    // 'updateFunctionConfiguration' since only this update
    // function takes Publish as a param. This should
    // always be called AFTER 'updateFunctionConfiguration'
    // so that the updated function is properly published,
    // if needed.

    const lamparams: AWS.Lambda.UpdateFunctionCodeRequest = {
        FunctionName: params.functionName,
        Publish: params.publish
    };

    if (params.s3) {
        lamparams.S3Bucket = params.s3.bucket;
        lamparams.S3Key = params.s3.key;
    } else {
        lamparams.ZipFile = params.file.contents;
    }

    return lambda.updateFunctionCode(lamparams).promise();
}

async function updateFunctionConfiguration(lambda: AWS.Lambda, params: Params) {
    const lamparams: AWS.Lambda.UpdateFunctionConfigurationRequest = {
        FunctionName: params.functionName,
        Role: params.role,
        Handler: params.handler || DEFAULT_PARAMS.handler,
        Runtime: params.runtime || DEFAULT_PARAMS.runtime
    };

    if (params.memory) {
        lamparams.MemorySize = params.memory;
    }

    if (params.description) lamparams.Description = params.description;
    if (params.timeout) lamparams.Timeout = params.timeout;

    if (params.subnets && params.securityGroups) {
        lamparams.VpcConfig = {
            SubnetIds: typeof params.subnets === 'string' ? [params.subnets] : params.subnets,
            SecurityGroupIds: typeof params.securityGroups === 'string' ? [params.securityGroups] : params.securityGroups,
        };
    }

    return lambda.updateFunctionConfiguration(lamparams).promise();
}

async function createFunction(lambda: AWS.Lambda, params: Params) {
    let code: AWS.Lambda.FunctionCode = {};
    if (params.s3) {
        code.S3Bucket = params.s3.bucket;
        code.S3Key = params.s3.key;
    } else {
        code.ZipFile = params.file.contents;
    }

    const lamparams: AWS.Lambda.CreateFunctionRequest = {
        Code: code,
        FunctionName: params.functionName,
        Handler: params.handler || DEFAULT_PARAMS.handler,
        Runtime: params.runtime || DEFAULT_PARAMS.runtime,
        Role: params.role,
        Publish: params.publish
    };

    if (params.memory) {
        lamparams.MemorySize = params.memory;
    }

    if (params.description) lamparams.Description = params.description;
    if (params.timeout) lamparams.Timeout = params.timeout;

    if (params.subnets && params.securityGroups) {
        lamparams.VpcConfig = {
            SubnetIds: typeof params.subnets === 'string' ? [params.subnets] : params.subnets,
            SecurityGroupIds: typeof params.securityGroups === 'string' ? [params.securityGroups] : params.securityGroups,
        };
    }

    return  lambda.createFunction(lamparams).promise();
}

async function getAlias(lambda: AWS.Lambda, params: Params) {
    const lamparams = {
        FunctionName: params.functionName,
        Name: params.alias
    };

    return lambda.getAlias(lamparams).promise();
}

async function createAlias(lambda: AWS.Lambda, version: string, params: Params) {
    const lamparams: AWS.Lambda.CreateAliasRequest = {
        FunctionName: params.functionName,
        FunctionVersion: version,
        Name: params.alias
    };

    return lambda.createAlias(lamparams).promise();
}

async function updateAlias(lambda: AWS.Lambda, version: string, params: Params) {
    const lamparams: AWS.Lambda.UpdateAliasRequest = {
        FunctionName: params.functionName,
        FunctionVersion: version,
        Name: params.alias
    };

    return lambda.updateAlias(lamparams).promise();
}

async function upsertAlias(lambda: AWS.Lambda, version: string, params: Params) {
    return getAlias(lambda, params).then((alias) => {
        if (!alias) return createAlias(lambda, version, params);
        return updateAlias(lambda, version, params);
    });
}

export = main;