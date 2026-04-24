#!/bin/bash

# Serverless Framework Deployment Script
# Usage: ./scripts/deploy-serverless.sh [stage] [options]
# Example: ./scripts/deploy-serverless.sh dev
# Example: ./scripts/deploy-serverless.sh prod --verbose

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to display usage
usage() {
    echo "Usage: $0 [stage] [options]"
    echo ""
    echo "Stages:"
    echo "  dev   - Deploy to development environment"
    echo "  uat   - Deploy to UAT environment"
    echo "  prod  - Deploy to production environment"
    echo ""
    echo "Options:"
    echo "  --dry-run     - Perform a dry run without deploying"
    echo "  --verbose     - Enable verbose output"
    echo "  --force       - Force deployment without confirmation (use with caution)"
    echo "  --help, -h    - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev"
    echo "  $0 prod --verbose"
    echo "  $0 uat --dry-run"
    exit 1
}

# Parse arguments
STAGE=""
DRY_RUN=false
VERBOSE=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        dev|uat|prod)
            STAGE="$1"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate stage
if [ -z "$STAGE" ]; then
    print_error "Stage is required"
    usage
fi

if [[ ! "$STAGE" =~ ^(dev|uat|prod)$ ]]; then
    print_error "Invalid stage: $STAGE. Must be one of: dev, uat, prod"
    exit 1
fi

# Print deployment info
echo ""
print_info "=========================================="
print_info "Serverless Framework Deployment"
print_info "=========================================="
print_info "Stage: $STAGE"
print_info "Dry Run: $DRY_RUN"
print_info "=========================================="
echo ""

# Check if serverless is installed
if ! command -v serverless &> /dev/null && ! command -v npx &> /dev/null; then
    print_error "Serverless Framework is not installed"
    print_info "Installing serverless globally..."
    npm install -g serverless
fi

# Use npx if serverless is not in PATH
SERVERLESS_CMD="serverless"
if ! command -v serverless &> /dev/null; then
    SERVERLESS_CMD="npx serverless"
fi

# Check if .env file exists
if [ ! -f ".env" ] && [ ! -f ".env.$STAGE" ]; then
    print_warning ".env or .env.$STAGE file not found"
    print_info "Make sure environment variables are set"
fi

# Validate required environment variables
print_info "Validating environment variables..."

REQUIRED_VARS=(
    "AWS_SECRET_NAME"
    "DDB_USER_TABLE"
    "DDB_EMPLOYEE_TABLE"
    "S3_CERT_BUCKET"
    "FIREBASE_PROJECT_ID"
    "FIREBASE_CLIENT_EMAIL"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    print_warning "Some environment variables are not set:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    print_info "These may be loaded from .env file or AWS Secrets Manager"
fi

# Check AWS credentials
print_info "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured or invalid"
    print_info "Please configure AWS credentials using:"
    print_info "  aws configure"
    print_info "  or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "ap-east-1")
print_success "AWS Account: $AWS_ACCOUNT"
print_success "AWS Region: $AWS_REGION"

# Confirm deployment (unless --force is used)
if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
    echo ""
    print_warning "You are about to deploy to: $STAGE"
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
fi

# Build arguments
DEPLOY_ARGS=("deploy" "--stage" "$STAGE")

if [ "$VERBOSE" = true ]; then
    DEPLOY_ARGS+=("--verbose")
fi

if [ "$DRY_RUN" = true ]; then
    print_info "Running dry-run (package only)..."
    DEPLOY_ARGS=("package" "--stage" "$STAGE")
    if [ "$VERBOSE" = true ]; then
        DEPLOY_ARGS+=("--verbose")
    fi
fi

# Run deployment
echo ""
print_info "Starting deployment..."
echo ""

if [ "$DRY_RUN" = true ]; then
    $SERVERLESS_CMD "${DEPLOY_ARGS[@]}"
    print_success "Dry-run completed successfully"
    print_info "Package created in .serverless directory"
else
    # Execute deployment
    if $SERVERLESS_CMD "${DEPLOY_ARGS[@]}"; then
        echo ""
        print_success "=========================================="
        print_success "Deployment completed successfully!"
        print_success "=========================================="
        echo ""
        print_info "To view deployment info, run:"
        print_info "  $SERVERLESS_CMD info --stage $STAGE"
        echo ""
    else
        echo ""
        print_error "=========================================="
        print_error "Deployment failed!"
        print_error "=========================================="
        echo ""
        print_info "Check the error messages above for details"
        print_info "To rollback, you may need to manually revert changes"
        exit 1
    fi
fi
