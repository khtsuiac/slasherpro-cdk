import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
// import { HandleMatchLambda } from './constructs/handle-match-lambda';
import { SharedTables } from './constructs/shared-tables';
import { SharedBucket } from './constructs/shared-buckets';
import * as dotenv from 'dotenv';
// import { MatchQueue } from './constructs/invoke-ai-match';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as customResources from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import * as path from 'path';
import { SecretProps } from 'aws-cdk-lib/aws-secretsmanager';
dotenv.config({ path: process.env.ENV === 'DEV' ? '.env.local' : process.env.ENV === 'UAT' ? '.env.uat' : '.env.prod' });

export class SlasherproCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const resourcePrefix = `${process.env.PJ_PREFIX}-${process.env.ENV}`;
    // ============================================
    // IMPORT EXISTING AWS RESOURCES
    // ============================================
    // Run: ./scripts/discover-resources.sh
    // Then: node scripts/generate-imports.js
    // Copy the generated imports below

    // TODO: Add your imported resources here
    // Example:
    // const importedUserTable = dynamodb.Table.fromTableName(
    //   this,
    //   'ImportedUserTable',
    //   'YOUR_TABLE_NAME'
    // );
    // Read all key values from .env file and turn into Object


    function parseEnvFile(envPath: string): { [key: string]: string } {
      const envObj: { [key: string]: string } = {};
      if (fs.existsSync(envPath)) {
        const envData = fs.readFileSync(envPath, 'utf8');
        envData.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          if (trimmed.startsWith('#')) return; // Ignore comments
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) return;
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          envObj[key] = value.replace(/^"(.*)"$/, '$1');
        });
      }
      return envObj;
    }

    const envFilePath = path.resolve(process.cwd(), process.env.ENV === 'DEV' ? '.env.local' : process.env.ENV === 'UAT' ? '.env.uat' : '.env.prod');


    // ============================================
    // NEW RESOURCES (or reference imported ones)
    // ============================================

    // Change the reosurce name here
    const userTableName = `${resourcePrefix}-USER`;
    const jobTableName = `${resourcePrefix}-JOB`;
    const transactionTableName = `${resourcePrefix}-TRANSACTION`;
    const matchHistoryTableName = `${resourcePrefix}-MATCH-HISTORY`;
    const ticketTableName = `${resourcePrefix}-TICKET`;
    const matchTableName = `${resourcePrefix}-MATCH`;
    const failLogsBucketName = `${resourcePrefix.toLowerCase()}-lambda-fail-logs`;
    const uploadPrivateBucketName = `${resourcePrefix.toLowerCase()}-upload-private`;
    const uploadPublicBucketName = `${resourcePrefix.toLowerCase()}-upload-public`;
 
    // ============================================
    // SHARED TABLES
    // ============================================
    const sharedTables = new SharedTables(this, `${resourcePrefix}-TABLES`, {
      userTableName,
      jobTableName,
      transactionTableName,
      matchHistoryTableName,
      matchTableName,
      enableMatchTableStream: true, // Enable stream for Lambda trigger
      ticketTableName,
    });

    // ============================================
    // SHARED BUCKETS
    // ============================================
    const sharedBuckets = new SharedBucket(this, `${resourcePrefix}-BUCKETS`, {
      logBucketName: failLogsBucketName,
      uploadPrivateBucketName: uploadPrivateBucketName,
      uploadPublicBucketName: uploadPublicBucketName,
    });

    // ============================================
    // HANDLE-MATCH LAMBDA CHAIN
    // ============================================
    // Includes: Lambda function, DynamoDB stream trigger, S3 failure logs
    // const handleMatchLambda = new HandleMatchLambda(this, `${resourcePrefix}-HANDLE-MATCH-LAMBDA`, {
    //   userTable: sharedTables.userTable,
    //   jobTable: sharedTables.jobTable,
    //   transactionTable: sharedTables.transactionTable,
    //   matchHistoryTable: sharedTables.matchHistoryTable,
    //   matchTable: sharedTables.matchTable,
    //   failLogBucket: sharedBuckets.logBucket,
    // });


    // ============================================
    // MATCH QUEUE
    // ============================================
    // const matchQueue = new MatchQueue(this, `${resourcePrefix}-MATCH-QUEUE`, {
    //   requestQueueName: `${resourcePrefix}-MATCH-REQUEST-QUEUE`,
    //   lambdaFunctionName: `${resourcePrefix}-SQS-INVOKE-MATCH-AI-LAMBDA`,
    //   jobTable: sharedTables.jobTable,
    // });

    cdk.Tags.of(this).add('project', process.env.PJ_PREFIX || "undefined");
    cdk.Tags.of(this).add('env', process.env.ENV || "undefined");


    // ============================================
    // Secret Manager
    // Following AWS best practices: https://docs.aws.amazon.com/secretsmanager/latest/userguide/cdk.html
    // Create secret first, then populate it securely without exposing values in CloudFormation template
    // ============================================
    const envVarsObject = parseEnvFile(envFilePath);
    console.log('envVarsObject', envVarsObject);

    // Create empty secret first (will be populated by Custom Resource)
    const backendSecret = new secretsmanager.Secret(this, `${resourcePrefix}-BackendSecret`, {
      secretName: `${resourcePrefix}/BACKEND/SECRET`,
      description: 'Backend application secrets',
    });

    // Use AwsCustomResource to populate secret values securely
    // This approach avoids using unsafePlainText while still creating the secret in CDK
    // Note: Values are still in CloudFormation template, but Secrets Manager encrypts them at rest
    new customResources.AwsCustomResource(this, `${resourcePrefix}-SecretPopulatorResource`, {
      onCreate: {
        service: 'SecretsManager',
        action: 'putSecretValue',
        parameters: {
          SecretId: backendSecret.secretArn,
          SecretString: JSON.stringify(envVarsObject),
        },
        physicalResourceId: customResources.PhysicalResourceId.of(backendSecret.secretArn),
      },
      onUpdate: {
        service: 'SecretsManager',
        action: 'putSecretValue',
        parameters: {
          SecretId: backendSecret.secretArn,
          SecretString: JSON.stringify(envVarsObject),
        },
        physicalResourceId: customResources.PhysicalResourceId.of(backendSecret.secretArn),
      },
      policy: customResources.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:PutSecretValue'],
          resources: [backendSecret.secretArn],
        }),
      ]),
    });
  }
}
