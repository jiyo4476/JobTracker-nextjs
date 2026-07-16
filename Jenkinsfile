pipeline {
    agent any

    environment {
        CI = 'true'
        DOCKER_IMAGE = 'job-tracker-nextjs'
        NEXT_TELEMETRY_DISABLED = '1'
    }

    options {
        disableConcurrentBuilds(abortPrevious: true)
        timestamps()
    }

    stages {
        stage('Validate inside Node container') {
            agent {
                docker {
                    image 'node:20-alpine'
                    reuseNode true
                }
            }
            steps {
                sh 'node --version'
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm run typecheck'
                sh 'npm test'
                sh 'npm run build'
            }
        }

        stage('Build application image') {
            steps {
                script {
                    docker.build("${env.DOCKER_IMAGE}:${env.BUILD_ID}")
                }
            }
        }
    }

    post {
        always {
            deleteDir()
        }
    }
}
