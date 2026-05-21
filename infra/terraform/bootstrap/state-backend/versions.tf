terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.83"
    }

    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}
