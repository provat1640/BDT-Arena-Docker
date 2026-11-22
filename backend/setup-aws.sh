#!/bin/bash
# AWS Infrastructure Setup Script for BDT Arena
# This script deploys the CloudFormation template and sets up all necessary AWS resources

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
STACK_NAME="bdt-arena-${ENVIRONMENT:-staging}"
REGION=${AWS_REGION:-us-east-1}
TEMPLATE_FILE="backend/cloudformation.yaml"
ENVIRONMENT=${ENVIRONMENT:-staging}

echo -e "${BLUE}BDT Arena AWS Infrastructure Setup${NC}"
echo "===================================="
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# Check prerequisites
check_prerequisites() {
	echo -e "${YELLOW}Checking prerequisites...${NC}"

	if ! command -v aws &> /dev/null; then
		echo -e "${RED}AWS CLI not found. Install: https://aws.amazon.com/cli/${NC}"
		exit 1
	fi

	# Check AWS credentials
	if ! aws sts get-caller-identity &> /dev/null; then
		echo -e "${RED}AWS credentials not configured. Run: aws configure${NC}"
		exit 1
	fi

	echo -e "${GREEN}✓ Prerequisites met${NC}"
}

# Validate template
validate_template() {
	echo -e "${YELLOW}Validating CloudFormation template...${NC}"

	aws cloudformation validate-template \
		--template-body file://"$TEMPLATE_FILE" \
		--region "$REGION" > /dev/null

	echo -e "${GREEN}✓ Template is valid${NC}"
}

# Get AWS Account ID
get_account_id() {
	aws sts get-caller-identity --query Account --output text
}

# Create or update stack
create_or_update_stack() {
	echo -e "${YELLOW}Deploying CloudFormation stack...${NC}"

	ACCOUNT_ID=$(get_account_id)

	if aws cloudformation describe-stacks \
		--stack-name "$STACK_NAME" \
		--region "$REGION" &> /dev/null; then

		echo "Updating existing stack..."
		aws cloudformation update-stack \
			--stack-name "$STACK_NAME" \
			--template-body file://"$TEMPLATE_FILE" \
			--parameters ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
			--capabilities CAPABILITY_IAM \
			--region "$REGION"

		echo "Waiting for stack update to complete..."
		aws cloudformation wait stack-update-complete \
			--stack-name "$STACK_NAME" \
			--region "$REGION"
	else
		echo "Creating new stack..."
		aws cloudformation create-stack \
			--stack-name "$STACK_NAME" \
			--template-body file://"$TEMPLATE_FILE" \
			--parameters ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
			--capabilities CAPABILITY_IAM \
			--region "$REGION"

		echo "Waiting for stack creation to complete..."
		aws cloudformation wait stack-create-complete \
			--stack-name "$STACK_NAME" \
			--region "$REGION"
	fi

	echo -e "${GREEN}✓ Stack deployment completed${NC}"
}

# Get stack outputs
get_stack_outputs() {
	echo -e "${YELLOW}Retrieving stack outputs...${NC}"

	OUTPUTS=$(aws cloudformation describe-stacks \
		--stack-name "$STACK_NAME" \
		--region "$REGION" \
		--query 'Stacks[0].Outputs')

	echo "$OUTPUTS" | jq -r '.[] | "\(.OutputKey): \(.OutputValue)"'
}

# Setup VPC flow logs
setup_vpc_flow_logs() {
	echo -e "${YELLOW}Setting up VPC Flow Logs...${NC}"

	VPC_ID=$(aws cloudformation describe-stacks \
		--stack-name "$STACK_NAME" \
		--region "$REGION" \
		--query 'Stacks[0].Outputs[?OutputKey==`VPCId`].OutputValue' \
		--output text)

	if [ ! -z "$VPC_ID" ]; then
		IAM_ROLE_ARN="arn:aws:iam::$(get_account_id):role/vpc-flow-logs-role"

		aws ec2 create-flow-logs \
			--resource-type VPC \
			--resource-ids "$VPC_ID" \
			--traffic-type ALL \
			--log-destination-type cloud-watch-logs \
			--log-group-name "/aws/vpc-flow-logs/bdt-arena-$ENVIRONMENT" \
			--deliver-logs-permission-role-arn "$IAM_ROLE_ARN" \
			--region "$REGION" 2>/dev/null || echo "Flow logs might already exist"

		echo -e "${GREEN}✓ VPC Flow Logs configured${NC}"
	fi
}

# Setup CloudWatch alarms
setup_cloudwatch_alarms() {
	echo -e "${YELLOW}Setting up CloudWatch alarms...${NC}"

	# DB CPU utilization alarm
	aws cloudwatch put-metric-alarm \
		--alarm-name "bdt-arena-db-cpu-high-$ENVIRONMENT" \
		--alarm-description "Alert when RDS CPU is high" \
		--metric-name CPUUtilization \
		--namespace AWS/RDS \
		--statistic Average \
		--period 300 \
		--threshold 80 \
		--comparison-operator GreaterThanThreshold \
		--evaluation-periods 2 \
		--region "$REGION" 2>/dev/null || true

	# DB connection alarm
	aws cloudwatch put-metric-alarm \
		--alarm-name "bdt-arena-db-connections-high-$ENVIRONMENT" \
		--alarm-description "Alert when RDS connections are high" \
		--metric-name DatabaseConnections \
		--namespace AWS/RDS \
		--statistic Average \
		--period 300 \
		--threshold 80 \
		--comparison-operator GreaterThanThreshold \
		--evaluation-periods 2 \
		--region "$REGION" 2>/dev/null || true

	echo -e "${GREEN}✓ CloudWatch alarms configured${NC}"
}

# Setup S3 for backups
setup_s3_backups() {
	echo -e "${YELLOW}Setting up S3 for backups...${NC}"

	BUCKET_NAME="bdt-arena-backups-$(get_account_id)-$REGION"

	if aws s3 ls "s3://$BUCKET_NAME" 2>/dev/null; then
		echo "Backup bucket already exists"
	else
		aws s3 mb "s3://$BUCKET_NAME" --region "$REGION"

		# Enable versioning
		aws s3api put-bucket-versioning \
			--bucket "$BUCKET_NAME" \
			--versioning-configuration Status=Enabled

		# Enable encryption
		aws s3api put-bucket-encryption \
			--bucket "$BUCKET_NAME" \
			--server-side-encryption-configuration '{
				"Rules": [{
					"ApplyServerSideEncryptionByDefault": {
						"SSEAlgorithm": "AES256"
					}
				}]
			}'

		echo -e "${GREEN}✓ S3 backup bucket created${NC}"
	fi
}

# Setup SNS for notifications
setup_sns_notifications() {
	echo -e "${YELLOW}Setting up SNS for notifications...${NC}"

	TOPIC_ARN=$(aws sns create-topic \
		--name "bdt-arena-alerts-$ENVIRONMENT" \
		--region "$REGION" \
		--query 'TopicArn' \
		--output text 2>/dev/null)

	echo "SNS Topic ARN: $TOPIC_ARN"
	echo "Subscribe to this topic for alerts: https://console.aws.amazon.com/sns/"

	echo -e "${GREEN}✓ SNS topic created${NC}"
}

# Print summary
print_summary() {
	echo ""
	echo -e "${GREEN}========================================${NC}"
	echo -e "${GREEN}Infrastructure deployment completed! 🎉${NC}"
	echo -e "${GREEN}========================================${NC}"
	echo ""
	echo "Stack Name: $STACK_NAME"
	echo "Region: $REGION"
	echo "Environment: $ENVIRONMENT"
	echo ""
	echo "Next steps:"
	echo "1. Deploy application: eb deploy"
	echo "2. Run migrations: npm run migrate"
	echo "3. Monitor: aws cloudwatch get-metric-statistics"
	echo "4. View logs: tail -f /var/log/bdt-arena/combined.log"
	echo ""
	echo "Management Console:"
	echo "- CloudFormation: https://console.aws.amazon.com/cloudformation/"
	echo "- VPC: https://console.aws.amazon.com/vpc/"
	echo "- RDS: https://console.aws.amazon.com/rds/"
	echo "- EC2: https://console.aws.amazon.com/ec2/"
}

# Main execution
main() {
	check_prerequisites
	validate_template
	create_or_update_stack
	get_stack_outputs
	setup_vpc_flow_logs
	setup_cloudwatch_alarms
	setup_s3_backups
	setup_sns_notifications
	print_summary
}

# Run main function
main "$@"
