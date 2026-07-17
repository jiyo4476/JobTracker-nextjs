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
                    image 'node:24.16-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a'
                    reuseNode true
                }
            }
            steps {
                sh 'node --version'
                sh 'npm install --global npm@12.0.1'
                sh 'npm --version'
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm run typecheck'
                sh 'npm test'
                sh 'npm run build'
            }
            post {
                always {
                    sh '''
                        rm -rf .next next-env.d.ts tsconfig.tsbuildinfo
                        if [ -d node_modules ]; then
                            find node_modules -mindepth 1 -delete
                        fi
                    '''
                }
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
