
import { Construct } from "constructs";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
export interface SharedBucketProps {
    logBucketName: string;
    uploadPrivateBucketName: string;
    uploadPublicBucketName: string;
}

export class SharedBucket extends Construct {
    public readonly logBucket: s3.Bucket;
    public readonly uploadPrivateBucket: s3.Bucket;
    public readonly uploadPublicBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: SharedBucketProps) {
        super(scope, id);

        // this.logBucket = new s3.Bucket(this, `FAIL-LOGS-BUCKET`, {
        //     removalPolicy: cdk.RemovalPolicy.DESTROY,
        //     bucketName: props.logBucketName,
        // });

        this.uploadPrivateBucket = new s3.Bucket(this, `UPLOAD-PRIVATE-BUCKET`, {
            removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
            bucketName: props.uploadPrivateBucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        // this.uploadPublicBucket = new s3.Bucket(this, `UPLOAD-PUBLIC-BUCKET`, {
        //     removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
        //     bucketName: props.uploadPublicBucketName,
        //     publicReadAccess: true,
        //     blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY, // Explicitly allow public access
        //     // blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        //     // blockPublicAccess: s3.BlockPublicAccess.NONE,
        //     // publicReadAccess: true,
        // });

        this.uploadPublicBucket = new s3.Bucket(this, `UPLOAD-PUBLIC-BUCKET`, {
            removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
            bucketName: props.uploadPublicBucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY, // Must be NONE to allow public policies
            publicReadAccess: true,
        });

        this.uploadPublicBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [this.uploadPublicBucket.bucketArn, `${this.uploadPublicBucket.bucketArn}/*`],
            principals: [new iam.StarPrincipal()],
            effect: iam.Effect.ALLOW,
            sid: 'AllowLambdaToGetObject',
        }));

        this.uploadPublicBucket.addCorsRule({
            allowedOrigins: ['*'],
            allowedMethods: [s3.HttpMethods.GET],
            allowedHeaders: ['*'],
        });
    }
}