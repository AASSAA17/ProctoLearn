pipeline {
  agent any

  environment {
    REPO_PATH = '/var/jenkins_home/proctolearn'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('IaC Validation') {
      steps {
        dir("${env.REPO_PATH}") {
          sh '''#!/bin/sh
            set -eu
            test -f infra/terraform/main.tf
            test -f infra/ansible/playbook.yml

            if command -v terraform >/dev/null 2>&1; then
              terraform -chdir=infra/terraform init -backend=false
              terraform -chdir=infra/terraform validate
            else
              echo "Terraform not installed on Jenkins agent, skipping terraform validate"
            fi

            if command -v ansible-playbook >/dev/null 2>&1; then
              ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml --syntax-check
            else
              echo "Ansible not installed on Jenkins agent, skipping ansible syntax check"
            fi
          '''
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        dir("${env.REPO_PATH}") {
          sh 'docker compose -f docker-compose.dev.yml build api web'
        }
      }
    }

    stage('Backend Tests') {
      steps {
        sh 'docker run --rm proctolearn-api sh -lc "npm run test --if-present"'
      }
    }

    stage('Frontend Tests') {
      steps {
        sh 'docker run --rm proctolearn-web sh -lc "npm run test --if-present"'
      }
    }

    stage('Deploy (Docker Compose)') {
      steps {
        dir("${env.REPO_PATH}") {
          sh 'docker compose -f docker-compose.dev.yml up -d --build'
        }
      }
    }
  }

  post {
    always {
      dir("${env.REPO_PATH}") {
        sh 'docker compose -f docker-compose.dev.yml ps || true'
      }
    }
    success {
      echo 'Pipeline completed successfully.'
    }
    failure {
      echo 'Pipeline failed. Check stage logs for details.'
    }
  }
}