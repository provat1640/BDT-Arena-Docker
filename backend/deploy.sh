#!/bin/bash
# AWS Elastic Beanstalk Deployment Script
# This script automates the deployment of BDT Arena to AWS Elastic Beanstalk

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="BDT_Arena"
ENV_NAME="BDTarena-env"
REGION="us-east-1"
INSTANCE_TYPE="t3.medium"
MIN_INSTANCES=2
MAX_INSTANCES=6

echo -e "${GREEN}BDT Arena AWS Elastic Beanstalk Deployment Script${NC}"
echo "=================================================="

# Check prerequisites
check_prerequisites() {
	echo -e "${YELLOW}Checking prerequisites...${NC}"

	if ! command -v aws &> /dev/null; then
		echo -e "${RED}AWS CLI not found. Please install it first.${NC}"
		exit 1
	fi

	if ! command -v eb &> /dev/null; then
		echo -e "${RED}EB CLI not found. Install with: pip install awsebcli${NC}"
		exit 1
	fi

	if ! command -v node &> /dev/null; then
		echo -e "${RED}Node.js not found. Please install it first.${NC}"
		exit 1
	fi

	echo -e "${GREEN}✓ All prerequisites met${NC}"
}

# Build application
build_app() {
	echo -e "${YELLOW}Building application...${NC}"

	# Build backend
	cd backend
	npm install
	npm run build
	cd ..

	# Build frontend
	cd frontend
	npm install
	npm run build
	cd ..

	echo -e "${GREEN}✓ Build completed${NC}"
}

# Initialize EB if needed
init_eb() {
	echo -e "${YELLOW}Initializing Elastic Beanstalk...${NC}"

	if [ ! -d ".elasticbeanstalk" ]; then
		eb init \
			--platform "Node.js 18 running on 64bit Amazon Linux 2" \
			--region "$REGION" \
			--application-name "$APP_NAME" \
			bdt-arena
	fi

	echo -e "${GREEN}✓ EB initialized${NC}"
}

# Create environment
create_environment() {
	echo -e "${YELLOW}Creating Elastic Beanstalk environment...${NC}"

	# Check if environment exists
	if eb list | grep -q "$ENV_NAME"; then
		echo -e "${YELLOW}Environment already exists. Skipping creation.${NC}"
	else
		eb create "$ENV_NAME" \
			--instance-type "$INSTANCE_TYPE" \
			--scale "$MIN_INSTANCES" \
			--enable-spot \
			--elb-type application \
			--enable-https \
			--ssl-certificate-arn "arn:aws:acm:$REGION:$(aws sts get-caller-identity --query Account --output text):certificate/YOUR_CERT_ID"
	fi

	echo -e "${GREEN}✓ Environment ready${NC}"
}

# Configure environment variables
configure_env_vars() {
	echo -e "${YELLOW}Configuring environment variables...${NC}"

	# Read from .env.production file
	if [ ! -f ".env.production" ]; then
		echo -e "${RED}.env.production file not found. Please create it first.${NC}"
		exit 1
	fi

	# Set environment variables
	eb setenv $(cat .env.production | xargs)

	echo -e "${GREEN}✓ Environment variables configured${NC}"
}

# Run database migrations
run_migrations() {
	echo -e "${YELLOW}Running database migrations...${NC}"

	eb ssh --force --command "cd /var/app/current && npm run migrate"

	echo -e "${GREEN}✓ Migrations completed${NC}"
}

# Deploy application
deploy_app() {
	echo -e "${YELLOW}Deploying application...${NC}"

	eb deploy "$ENV_NAME"

	echo -e "${GREEN}✓ Deployment initiated${NC}"
}

# Wait for deployment
wait_for_deployment() {
	echo -e "${YELLOW}Waiting for deployment to complete...${NC}"

	while [ "$(eb status | grep 'Health:' | awk '{print $NF}')" != "Green" ]; do
		echo "Status: $(eb status | grep 'Health:')"
		sleep 10
	done

	echo -e "${GREEN}✓ Deployment completed successfully${NC}"
}

# Verify deployment
verify_deployment() {
	echo -e "${YELLOW}Verifying deployment...${NC}"

	APP_URL=$(eb open --print-url)

	# Check health endpoint
	HEALTH_CHECK=$(curl -s "$APP_URL/api/health" | grep -o '"status":"[^"]*"')

	if echo "$HEALTH_CHECK" | grep -q "ok"; then
		echo -e "${GREEN}✓ Application is healthy${NC}"
		echo -e "${GREEN}Application URL: $APP_URL${NC}"
	else
		echo -e "${RED}Health check failed: $HEALTH_CHECK${NC}"
		exit 1
	fi
}

# Main execution
main() {
	check_prerequisites
	build_app
	init_eb
	create_environment
	configure_env_vars
	deploy_app
	wait_for_deployment
	run_migrations
	verify_deployment

	echo ""
	echo -e "${GREEN}========================================${NC}"
	echo -e "${GREEN}Deployment completed successfully! 🎉${NC}"
	echo -e "${GREEN}========================================${NC}"
	echo ""
	echo "Environment: $ENV_NAME"
	echo "Region: $REGION"
	echo "Application: $APP_NAME"
	echo ""
	echo "Next steps:"
	echo "1. Monitor logs: eb logs --stream"
	echo "2. Check status: eb status"
	echo "3. SSH into instance: eb ssh"
	echo "4. Open dashboard: eb open"
}

# Run main function
main
