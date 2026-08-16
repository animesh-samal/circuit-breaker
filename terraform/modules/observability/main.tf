# Alarms, dashboard, and the budget guard.
#
# The log group deliberately lives in the root module, not here. Compute needs
# its ARN to build the node's IAM policy, and this module needs compute's
# instance ID for the alarms -- putting the log group in either one creates a
# cycle. Terraform will tell you about it, but the fix is to notice which
# resource is genuinely shared and hoist it, rather than to start passing
# hand-built ARN strings around to dodge the reference.

resource "aws_cloudwatch_metric_alarm" "node_cpu" {
  alarm_name          = "${var.project}-node-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 85
  period              = 300
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  dimensions          = { InstanceId = var.instance_id }

  # A t3.micro is burstable. Sustained high CPU exhausts its credit balance and
  # the instance is throttled hard -- so this alarm is about credit exhaustion,
  # not the CPU number itself.
  alarm_description = "Sustained CPU on a burstable instance; check credit balance."
  treat_missing_data = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "${var.project}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 10
  period              = 300
  namespace           = "CircuitBreaker"
  metric_name         = "ErrorCount"
  statistic           = "Sum"

  alarm_description  = "API returning errors."
  treat_missing_data = "notBreaching"
}

# Missing data is treated as "not breaching" on both. A service with no traffic
# publishes no datapoints, and an alarm that fires because nobody visited the
# site is an alarm people learn to ignore.

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.project

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "Node CPU"
          region = var.region
          metrics = [["AWS/EC2", "CPUUtilization", "InstanceId", var.instance_id]]
          period = 300
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "Requests and errors"
          region = var.region
          metrics = [
            ["CircuitBreaker", "RequestCount"],
            ["CircuitBreaker", "ErrorCount"],
          ]
          period = 300
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "p95 latency"
          region = var.region
          metrics = [["CircuitBreaker", "RequestLatencyMs", { stat = "p95" }]]
          period = 300
        }
      },
    ]
  })
}

# The guard rail that matters most on a personal account. Budgets are free.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }

  # Forecast alerts catch a runaway before it has finished running away.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
