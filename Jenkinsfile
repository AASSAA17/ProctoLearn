pipeline {
  agent any

  environment {
    REPO_PATH = '/var/jenkins_home/proctolearn'
  }

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  stages {
    stage('Build Docker Images') {
      steps {
        dir("${env.REPO_PATH}") {
          sh 'docker compose -f docker-compose.dev.yml build api web'
        }
      }
    }

    stage('Backend Tests') {
      steps {
        dir("${env.REPO_PATH}/backend") {
          sh 'docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -lc "npm ci && npm run test --if-present"'
        }
      }
    }

    stage('Frontend Tests') {
      steps {
        dir("${env.REPO_PATH}/frontend") {
          sh 'docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -lc "npm ci && npm run test --if-present"'
        }
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