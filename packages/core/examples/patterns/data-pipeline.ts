import { task, recipe, parallel } from '@xec/core';
import { awsModule, k8sModule, monitoringModule } from '@xec/core/modules/builtin';

/**
 * Complete data pipeline automation pattern
 * 
 * This example shows how to build a scalable data pipeline
 * with ETL/ELT processes, real-time streaming, and analytics.
 */

export const dataPipeline = recipe('data-pipeline')
  .description('Deploy a complete data pipeline infrastructure')
  .variables({
    pipelineName: 'analytics-pipeline',
    environment: 'production',
    
    // Data sources
    sources: [
      { type: 'postgresql', name: 'app-db', host: 'app.db.example.com' },
      { type: 's3', name: 'logs', bucket: 'app-logs-bucket' },
      { type: 'kafka', name: 'events', brokers: ['kafka1:9092', 'kafka2:9092'] },
      { type: 'api', name: 'external', endpoint: 'https://api.example.com/data' }
    ],
    
    // Processing configuration
    processing: {
      batchSize: 10000,
      parallelism: 4,
      checkpointInterval: 60000, // 1 minute
      windowSize: 300000 // 5 minutes
    },
    
    // Storage configuration
    storage: {
      dataLake: 's3://data-lake-bucket',
      warehouse: 'redshift',
      cache: 'redis',
      timeseries: 'influxdb'
    },
    
    // Features
    enableStreaming: true,
    enableBatchProcessing: true,
    enableMLPipeline: true,
    enableDataQuality: true
  })
  
  // Phase 1: Infrastructure Setup
  .phase('infrastructure', phase => phase
    .description('Set up data infrastructure')
    
    // Create S3 buckets for data lake
    .task(task('create-data-lake', async ({ vars, log }) => {
      log.info('Creating data lake storage...');
      
      const buckets = [
        { name: `${vars.pipelineName}-raw`, lifecycle: 'archive-after-30-days' },
        { name: `${vars.pipelineName}-processed`, lifecycle: 'delete-after-90-days' },
        { name: `${vars.pipelineName}-curated`, lifecycle: 'keep' },
        { name: `${vars.pipelineName}-ml`, lifecycle: 'keep' }
      ];
      
      await parallel(
        ...buckets.map(bucket =>
          awsModule.tasks.s3Bucket.run({
            vars,
            log,
            params: {
              bucketName: bucket.name,
              versioning: bucket.lifecycle === 'keep',
              encryption: true,
              lifecycle: bucket.lifecycle
            }
          })
        )
      );
    }))
    
    // Set up data warehouse
    .task(task('create-warehouse', async ({ vars, log }) => {
      log.info('Setting up data warehouse...');
      
      if (vars.storage.warehouse === 'redshift') {
        await awsModule.tasks.cloudformation.run({
          vars,
          log,
          params: {
            stackName: `${vars.pipelineName}-warehouse`,
            templateBody: {
              AWSTemplateFormatVersion: '2010-09-09',
              Resources: {
                RedshiftCluster: {
                  Type: 'AWS::Redshift::Cluster',
                  Properties: {
                    ClusterIdentifier: `${vars.pipelineName}-cluster`,
                    NodeType: 'dc2.large',
                    NumberOfNodes: 3,
                    MasterUsername: 'admin',
                    MasterUserPassword: vars.warehousePassword || 'ChangeMe123!',
                    DBName: 'analytics'
                  }
                }
              }
            }
          }
        });
      }
    }))
    
    // Deploy message queue infrastructure
    .task(task('deploy-messaging', async ({ vars, log }) => {
      log.info('Deploying messaging infrastructure...');
      
      // Deploy Kafka cluster
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'kafka',
          chart: 'bitnami/kafka',
          namespace: vars.pipelineName,
          values: {
            replicaCount: 3,
            persistence: { enabled: true, size: '100Gi' },
            zookeeper: { replicaCount: 3 }
          }
        }
      });
      
      // Create topics
      const topics = [
        { name: 'raw-events', partitions: 12, retention: '7d' },
        { name: 'processed-events', partitions: 6, retention: '30d' },
        { name: 'alerts', partitions: 1, retention: '1d' },
        { name: 'dead-letter', partitions: 3, retention: '90d' }
      ];
      
      for (const topic of topics) {
        await vars.$`kubectl exec -n ${vars.pipelineName} kafka-0 -- \
          kafka-topics.sh --create \
          --topic ${topic.name} \
          --partitions ${topic.partitions} \
          --replication-factor 3 \
          --config retention.ms=${parseRetention(topic.retention)} \
          --bootstrap-server kafka:9092`;
      }
    }))
  )
  
  // Phase 2: Data Ingestion
  .phase('ingestion', phase => phase
    .description('Set up data ingestion')
    .dependsOn('infrastructure')
    
    // Deploy database connectors
    .task(task('deploy-db-connectors', async ({ vars, log }) => {
      log.info('Deploying database connectors...');
      
      const dbSources = vars.sources.filter(s => ['postgresql', 'mysql', 'mongodb'].includes(s.type));
      
      await parallel(
        ...dbSources.map(source =>
          k8sModule.tasks.deploy.run({
            vars,
            log,
            params: {
              name: `connector-${source.name}`,
              image: 'debezium/connect:latest',
              namespace: vars.pipelineName,
              env: {
                BOOTSTRAP_SERVERS: 'kafka:9092',
                GROUP_ID: `${source.name}-connector`,
                CONFIG_STORAGE_TOPIC: `${source.name}-configs`,
                OFFSET_STORAGE_TOPIC: `${source.name}-offsets`,
                STATUS_STORAGE_TOPIC: `${source.name}-status`,
                CONNECT_PLUGIN_PATH: '/kafka/connect'
              },
              configMaps: {
                'connector-config': {
                  'connector.json': JSON.stringify({
                    name: source.name,
                    'connector.class': `io.debezium.connector.${source.type}.PostgresConnector`,
                    'database.hostname': source.host,
                    'database.port': source.port || 5432,
                    'database.user': vars.dbUser,
                    'database.password': vars.dbPassword,
                    'database.dbname': source.database,
                    'database.server.name': source.name,
                    'table.include.list': source.tables?.join(',') || '.*'
                  })
                }
              }
            }
          })
        )
      );
    }))
    
    // Set up S3 event notifications
    .task(task('configure-s3-events', async ({ vars, log }) => {
      log.info('Configuring S3 event notifications...');
      
      const s3Sources = vars.sources.filter(s => s.type === 's3');
      
      for (const source of s3Sources) {
        // Create Lambda for S3 processing
        await awsModule.tasks.lambda.run({
          vars,
          log,
          params: {
            functionName: `${vars.pipelineName}-s3-processor-${source.name}`,
            runtime: 'python3.9',
            handler: 's3_processor.handler',
            zipFile: 'lambdas/s3-processor.zip',
            environment: {
              KAFKA_BROKERS: vars.sources.find(s => s.type === 'kafka')?.brokers.join(','),
              TARGET_TOPIC: 'raw-events'
            }
          }
        });
        
        // Configure S3 bucket notification
        await vars.$`aws s3api put-bucket-notification-configuration \
          --bucket ${source.bucket} \
          --notification-configuration '{
            "LambdaFunctionConfigurations": [{
              "LambdaFunctionArn": "arn:aws:lambda:${vars.region}:${vars.accountId}:function:${vars.pipelineName}-s3-processor-${source.name}",
              "Events": ["s3:ObjectCreated:*"],
              "Filter": {
                "Key": {
                  "FilterRules": [{
                    "Name": "suffix",
                    "Value": ".json"
                  }]
                }
              }
            }]
          }'`;
      }
    }))
    
    // Deploy API collectors
    .task(task('deploy-api-collectors', async ({ vars, log }) => {
      log.info('Deploying API data collectors...');
      
      const apiSources = vars.sources.filter(s => s.type === 'api');
      
      await parallel(
        ...apiSources.map(source =>
          k8sModule.tasks.deploy.run({
            vars,
            log,
            params: {
              name: `collector-${source.name}`,
              image: `${vars.pipelineName}/api-collector:latest`,
              namespace: vars.pipelineName,
              env: {
                API_ENDPOINT: source.endpoint,
                API_KEY: vars[`${source.name}ApiKey`],
                POLL_INTERVAL: source.pollInterval || 60,
                KAFKA_BROKERS: vars.sources.find(s => s.type === 'kafka')?.brokers.join(','),
                TARGET_TOPIC: 'raw-events'
              },
              resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '512Mi' }
              }
            }
          })
        )
      );
    }))
  )
  
  // Phase 3: Stream Processing
  .phase('streaming', phase => phase
    .description('Set up stream processing')
    .dependsOn('ingestion')
    .condition(vars => vars.enableStreaming)
    
    // Deploy Apache Flink for stream processing
    .task(task('deploy-flink', async ({ vars, log }) => {
      log.info('Deploying Apache Flink...');
      
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'flink',
          chart: 'flink-operator/flink-kubernetes-operator',
          namespace: vars.pipelineName,
          values: {
            image: {
              repository: 'flink',
              tag: '1.17.0'
            },
            jobmanager: {
              replicas: 2,
              resources: {
                requests: { cpu: '1', memory: '2Gi' },
                limits: { cpu: '2', memory: '4Gi' }
              }
            },
            taskmanager: {
              replicas: vars.processing.parallelism,
              resources: {
                requests: { cpu: '2', memory: '4Gi' },
                limits: { cpu: '4', memory: '8Gi' }
              }
            }
          }
        }
      });
    }))
    
    // Deploy streaming jobs
    .task(task('deploy-streaming-jobs', async ({ vars, log, fs, yaml }) => {
      log.info('Deploying streaming jobs...');
      
      const jobs = [
        {
          name: 'event-enrichment',
          className: 'com.example.EventEnrichmentJob',
          parallelism: vars.processing.parallelism,
          sourceTopics: ['raw-events'],
          sinkTopic: 'enriched-events',
          checkpointInterval: vars.processing.checkpointInterval
        },
        {
          name: 'aggregation',
          className: 'com.example.AggregationJob',
          parallelism: vars.processing.parallelism,
          sourceTopics: ['enriched-events'],
          sinkTopic: 'aggregated-metrics',
          windowSize: vars.processing.windowSize
        },
        {
          name: 'anomaly-detection',
          className: 'com.example.AnomalyDetectionJob',
          parallelism: 2,
          sourceTopics: ['enriched-events'],
          sinkTopic: 'alerts',
          mlModel: 's3://ml-models/anomaly-detector-v2'
        }
      ];
      
      for (const job of jobs) {
        const jobSpec = {
          apiVersion: 'flink.apache.org/v1beta1',
          kind: 'FlinkDeployment',
          metadata: {
            name: job.name,
            namespace: vars.pipelineName
          },
          spec: {
            image: `${vars.pipelineName}/flink-jobs:latest`,
            flinkVersion: 'v1_17',
            flinkConfiguration: {
              'taskmanager.numberOfTaskSlots': '2',
              'state.backend': 'rocksdb',
              'state.checkpoints.dir': `s3://${vars.pipelineName}-checkpoints/${job.name}`,
              'execution.checkpointing.interval': String(job.checkpointInterval)
            },
            serviceAccount: 'flink',
            jobManager: {
              resource: {
                memory: '2048m',
                cpu: 1
              }
            },
            taskManager: {
              resource: {
                memory: '2048m',
                cpu: 2
              }
            },
            job: {
              jarURI: `local:///opt/flink/usrlib/streaming-jobs.jar`,
              entryClass: job.className,
              parallelism: job.parallelism,
              upgradeMode: 'stateless'
            }
          }
        };
        
        const jobPath = await fs.temp({ prefix: `flink-job-${job.name}-`, suffix: '.yaml' });
        await fs.write(jobPath, yaml.stringify(jobSpec));
        await vars.$`kubectl apply -f ${jobPath}`;
      }
    }))
  )
  
  // Phase 4: Batch Processing
  .phase('batch', phase => phase
    .description('Set up batch processing')
    .dependsOn('streaming')
    .condition(vars => vars.enableBatchProcessing)
    
    // Deploy Apache Spark
    .task(task('deploy-spark', async ({ vars, log }) => {
      log.info('Deploying Apache Spark...');
      
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'spark',
          chart: 'bitnami/spark',
          namespace: vars.pipelineName,
          values: {
            master: {
              replicas: 1,
              resources: {
                requests: { cpu: '2', memory: '4Gi' },
                limits: { cpu: '4', memory: '8Gi' }
              }
            },
            worker: {
              replicas: vars.processing.parallelism,
              resources: {
                requests: { cpu: '4', memory: '8Gi' },
                limits: { cpu: '8', memory: '16Gi' }
              }
            }
          }
        }
      });
    }))
    
    // Deploy Airflow for orchestration
    .task(task('deploy-airflow', async ({ vars, log }) => {
      log.info('Deploying Apache Airflow...');
      
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'airflow',
          chart: 'apache-airflow/airflow',
          namespace: vars.pipelineName,
          values: {
            executor: 'KubernetesExecutor',
            postgresql: { enabled: true },
            redis: { enabled: true },
            webserver: {
              replicas: 2,
              service: { type: 'LoadBalancer' }
            },
            scheduler: {
              replicas: 2
            },
            config: {
              AIRFLOW__CORE__DAGS_FOLDER: '/opt/airflow/dags',
              AIRFLOW__CORE__PARALLELISM: String(vars.processing.parallelism * 4),
              AIRFLOW__KUBERNETES__NAMESPACE: vars.pipelineName
            }
          }
        }
      });
    }))
    
    // Deploy DAGs
    .task(task('deploy-dags', async ({ vars, log, fs }) => {
      log.info('Deploying Airflow DAGs...');
      
      // Create DAGs ConfigMap
      const dags = {
        'daily_etl.py': generateETLDag(vars),
        'hourly_aggregation.py': generateAggregationDag(vars),
        'data_quality.py': generateDataQualityDag(vars),
        'ml_training.py': generateMLTrainingDag(vars)
      };
      
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        fs,
        params: {
          name: 'airflow-dags',
          namespace: vars.pipelineName,
          data: dags
        }
      });
      
      // Mount DAGs in Airflow
      await vars.$`kubectl patch deployment airflow-webserver \
        -n ${vars.pipelineName} \
        --type json \
        -p '[{
          "op": "add",
          "path": "/spec/template/spec/volumes/-",
          "value": {
            "name": "dags",
            "configMap": {
              "name": "airflow-dags"
            }
          }
        }]'`;
    }))
  )
  
  // Phase 5: Data Quality & Governance
  .phase('quality', phase => phase
    .description('Set up data quality and governance')
    .dependsOn('batch')
    .condition(vars => vars.enableDataQuality)
    
    // Deploy Great Expectations
    .task(task('deploy-great-expectations', async ({ vars, log }) => {
      log.info('Deploying Great Expectations...');
      
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'great-expectations',
          image: 'greatexpectations/great_expectations:latest',
          namespace: vars.pipelineName,
          env: {
            GE_HOME: '/ge',
            DATABASE_URL: `postgresql://admin:${vars.warehousePassword}@postgres:5432/expectations`
          },
          volumes: [`ge-data:/ge`]
        }
      });
      
      // Create expectations
      const expectations = [
        {
          suite: 'raw_data_quality',
          expectations: [
            { type: 'expect_column_values_to_not_be_null', column: 'id' },
            { type: 'expect_column_values_to_be_unique', column: 'id' },
            { type: 'expect_column_values_to_be_between', column: 'timestamp', min: '2020-01-01', max: 'now' }
          ]
        },
        {
          suite: 'processed_data_quality',
          expectations: [
            { type: 'expect_table_row_count_to_be_between', min: 1000, max: 1000000 },
            { type: 'expect_column_mean_to_be_between', column: 'amount', min: 0, max: 10000 }
          ]
        }
      ];
      
      // Deploy expectations as config
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        params: {
          name: 'data-expectations',
          namespace: vars.pipelineName,
          data: {
            'expectations.json': JSON.stringify(expectations, null, 2)
          }
        }
      });
    }))
    
    // Set up data lineage tracking
    .task(task('deploy-data-lineage', async ({ vars, log }) => {
      log.info('Setting up data lineage tracking...');
      
      // Deploy Apache Atlas for metadata management
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'atlas',
          chart: 'apache/atlas',
          namespace: vars.pipelineName,
          values: {
            persistence: { enabled: true, size: '100Gi' },
            kafka: { enabled: false, external: { brokers: ['kafka:9092'] } },
            hbase: { enabled: true },
            solr: { enabled: true }
          }
        }
      });
    }))
  )
  
  // Phase 6: Machine Learning Pipeline
  .phase('ml-pipeline', phase => phase
    .description('Set up ML pipeline')
    .dependsOn('quality')
    .condition(vars => vars.enableMLPipeline)
    
    // Deploy MLflow
    .task(task('deploy-mlflow', async ({ vars, log }) => {
      log.info('Deploying MLflow...');
      
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'mlflow',
          image: 'mlflow/mlflow:latest',
          namespace: vars.pipelineName,
          ports: ['5000:5000'],
          env: {
            BACKEND_STORE_URI: `postgresql://mlflow:${vars.dbPassword}@postgres:5432/mlflow`,
            DEFAULT_ARTIFACT_ROOT: `s3://${vars.pipelineName}-ml/artifacts`
          },
          command: 'mlflow server --host 0.0.0.0'
        }
      });
    }))
    
    // Deploy feature store
    .task(task('deploy-feature-store', async ({ vars, log }) => {
      log.info('Deploying feature store...');
      
      // Deploy Feast
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'feast',
          chart: 'feast-charts/feast',
          namespace: vars.pipelineName,
          values: {
            feast: {
              core: { enabled: true },
              serving: { enabled: true },
              jupyter: { enabled: true }
            },
            postgresql: { enabled: true },
            redis: { enabled: true }
          }
        }
      });
      
      // Register feature definitions
      const features = {
        'user_features.py': `
from feast import Entity, Feature, FeatureView, FileSource, ValueType
from datetime import timedelta

user = Entity(name="user_id", value_type=ValueType.STRING)

user_stats_source = FileSource(
    path="s3://${vars.pipelineName}-curated/user_stats.parquet",
    event_timestamp_column="timestamp",
)

user_stats_fv = FeatureView(
    name="user_stats",
    entities=["user_id"],
    ttl=timedelta(days=1),
    features=[
        Feature(name="total_purchases", dtype=ValueType.INT64),
        Feature(name="avg_purchase_value", dtype=ValueType.FLOAT),
        Feature(name="days_since_last_purchase", dtype=ValueType.INT32),
    ],
    online=True,
    input=user_stats_source,
    tags={"team": "analytics"},
)`,
        'product_features.py': `
from feast import Entity, Feature, FeatureView, FileSource, ValueType
from datetime import timedelta

product = Entity(name="product_id", value_type=ValueType.STRING)

product_stats_source = FileSource(
    path="s3://${vars.pipelineName}-curated/product_stats.parquet",
    event_timestamp_column="timestamp",
)

product_stats_fv = FeatureView(
    name="product_stats",
    entities=["product_id"],
    ttl=timedelta(hours=6),
    features=[
        Feature(name="view_count", dtype=ValueType.INT64),
        Feature(name="purchase_count", dtype=ValueType.INT64),
        Feature(name="avg_rating", dtype=ValueType.FLOAT),
        Feature(name="in_stock", dtype=ValueType.BOOL),
    ],
    online=True,
    input=product_stats_source,
    tags={"team": "analytics"},
)`
      };
      
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        params: {
          name: 'feast-features',
          namespace: vars.pipelineName,
          data: features
        }
      });
    }))
    
    // Deploy model training pipeline
    .task(task('deploy-training-pipeline', async ({ vars, log }) => {
      log.info('Deploying model training pipeline...');
      
      // Create Kubeflow pipeline
      const trainingPipeline = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'Workflow',
        metadata: {
          generateName: 'ml-training-pipeline-',
          namespace: vars.pipelineName
        },
        spec: {
          entrypoint: 'ml-pipeline',
          templates: [
            {
              name: 'ml-pipeline',
              dag: {
                tasks: [
                  {
                    name: 'data-preparation',
                    template: 'prepare-data',
                    arguments: {
                      parameters: [
                        { name: 'input-path', value: `s3://${vars.pipelineName}-curated/training-data` },
                        { name: 'output-path', value: `s3://${vars.pipelineName}-ml/prepared-data` }
                      ]
                    }
                  },
                  {
                    name: 'feature-engineering',
                    template: 'engineer-features',
                    dependencies: ['data-preparation']
                  },
                  {
                    name: 'model-training',
                    template: 'train-model',
                    dependencies: ['feature-engineering']
                  },
                  {
                    name: 'model-evaluation',
                    template: 'evaluate-model',
                    dependencies: ['model-training']
                  },
                  {
                    name: 'model-deployment',
                    template: 'deploy-model',
                    dependencies: ['model-evaluation'],
                    when: '{{tasks.model-evaluation.outputs.parameters.accuracy}} > 0.85'
                  }
                ]
              }
            }
          ]
        }
      };
      
      const pipelinePath = await vars.fs.temp({ prefix: 'ml-pipeline-', suffix: '.yaml' });
      await vars.fs.write(pipelinePath, vars.yaml.stringify(trainingPipeline));
      await vars.$`kubectl apply -f ${pipelinePath}`;
    }))
  )
  
  // Phase 7: Monitoring & Observability
  .phase('monitoring', phase => phase
    .description('Set up monitoring and observability')
    .dependsOn(['streaming', 'batch', 'ml-pipeline'])
    
    // Deploy monitoring stack
    .task(task('deploy-monitoring', async ({ vars, log }) => {
      log.info('Deploying monitoring stack...');
      
      await monitoringModule.patterns.fullStackMonitoring.template({
        vars,
        log,
        params: {
          namespace: `${vars.pipelineName}-monitoring`,
          includeLogging: true,
          includeTracing: true,
          includeAlerts: true
        }
      });
    }))
    
    // Create pipeline-specific dashboards
    .task(task('create-dashboards', async ({ vars, log }) => {
      log.info('Creating monitoring dashboards...');
      
      const dashboards = [
        {
          title: 'Data Pipeline Overview',
          panels: [
            { title: 'Events Per Second', query: 'rate(pipeline_events_processed_total[1m])' },
            { title: 'Processing Latency', query: 'histogram_quantile(0.95, pipeline_processing_duration_seconds_bucket)' },
            { title: 'Error Rate', query: 'rate(pipeline_errors_total[5m])' },
            { title: 'Data Quality Score', query: 'avg(data_quality_score)' }
          ]
        },
        {
          title: 'Streaming Jobs',
          panels: [
            { title: 'Flink Checkpoints', query: 'flink_jobmanager_job_lastCheckpointDuration' },
            { title: 'Kafka Lag', query: 'kafka_consumer_lag_sum' },
            { title: 'Records Processed', query: 'rate(flink_taskmanager_job_task_numRecordsIn[1m])' },
            { title: 'Backpressure', query: 'flink_taskmanager_job_task_backPressuredTimeMsPerSecond' }
          ]
        },
        {
          title: 'ML Pipeline',
          panels: [
            { title: 'Model Training Duration', query: 'ml_training_duration_seconds' },
            { title: 'Model Accuracy', query: 'ml_model_accuracy' },
            { title: 'Feature Store Latency', query: 'histogram_quantile(0.95, feast_serving_request_latency_seconds_bucket)' },
            { title: 'Predictions Per Second', query: 'rate(ml_predictions_total[1m])' }
          ]
        }
      ];
      
      for (const dashboard of dashboards) {
        await monitoringModule.tasks.grafana.run({
          vars,
          log,
          params: {
            action: 'import-dashboard',
            dashboardJson: await monitoringModule.helpers.createDashboard({
              title: dashboard.title,
              panels: dashboard.panels
            })
          }
        });
      }
    }))
    
    // Set up alerts
    .task(task('configure-alerts', async ({ vars, log }) => {
      log.info('Configuring alerts...');
      
      await monitoringModule.tasks.alerts.run({
        vars,
        log,
        params: {
          action: 'create-rules',
          rules: [
            {
              name: 'PipelineHighErrorRate',
              expression: 'rate(pipeline_errors_total[5m]) > 0.01',
              duration: '5m',
              summary: 'High error rate in data pipeline',
              labels: { severity: 'warning', component: 'pipeline' }
            },
            {
              name: 'KafkaConsumerLag',
              expression: 'kafka_consumer_lag_sum > 100000',
              duration: '10m',
              summary: 'Kafka consumer lag is too high',
              labels: { severity: 'critical', component: 'streaming' }
            },
            {
              name: 'DataQualityFailure',
              expression: 'data_quality_score < 0.8',
              duration: '15m',
              summary: 'Data quality below threshold',
              labels: { severity: 'warning', component: 'quality' }
            },
            {
              name: 'MLModelDrift',
              expression: 'ml_model_drift_score > 0.1',
              duration: '30m',
              summary: 'ML model drift detected',
              labels: { severity: 'warning', component: 'ml' }
            }
          ]
        }
      });
    }))
  )
  
  // Phase 8: Testing & Validation
  .phase('validation', phase => phase
    .description('Validate the data pipeline')
    .dependsOn('monitoring')
    
    // Run integration tests
    .task(task('integration-tests', async ({ vars, log }) => {
      log.info('Running integration tests...');
      
      // Test data flow
      const testData = {
        eventId: `test-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: 'test-user',
        eventType: 'test-event',
        properties: { test: true }
      };
      
      // Send test event
      await vars.$`kubectl exec -n ${vars.pipelineName} kafka-0 -- \
        kafka-console-producer.sh \
        --broker-list kafka:9092 \
        --topic raw-events << EOF
${JSON.stringify(testData)}
EOF`;
      
      // Wait for processing
      await vars.time.sleep(30000); // 30 seconds
      
      // Verify in data warehouse
      const result = await vars.$`kubectl exec -n ${vars.pipelineName} postgres-0 -- \
        psql -U admin -d analytics -c \
        "SELECT * FROM processed_events WHERE event_id = '${testData.eventId}'"`;
      
      if (!result.stdout.includes(testData.eventId)) {
        throw new Error('Test event not found in data warehouse');
      }
      
      log.info('Integration tests passed');
    }))
    
    // Generate pipeline report
    .task(task('generate-report', async ({ vars, log, fs }) => {
      log.info('Generating pipeline report...');
      
      const report = {
        pipeline: {
          name: vars.pipelineName,
          environment: vars.environment,
          timestamp: new Date().toISOString()
        },
        infrastructure: {
          dataSources: vars.sources,
          storage: vars.storage,
          processing: {
            streaming: vars.enableStreaming,
            batch: vars.enableBatchProcessing,
            ml: vars.enableMLPipeline
          }
        },
        components: {
          ingestion: ['Debezium', 'Lambda', 'API Collectors'],
          streaming: ['Apache Flink', 'Kafka'],
          batch: ['Apache Spark', 'Airflow'],
          ml: ['MLflow', 'Feast', 'Kubeflow'],
          monitoring: ['Prometheus', 'Grafana', 'Loki']
        },
        metrics: {
          throughput: 'Configured for 100K events/sec',
          latency: 'P95 < 100ms for streaming',
          storage: 'Unlimited with S3 backend',
          quality: 'Automated with Great Expectations'
        },
        endpoints: {
          airflow: `https://airflow.${vars.domain}`,
          mlflow: `https://mlflow.${vars.domain}`,
          grafana: `https://grafana.${vars.domain}`,
          feast: `https://feast.${vars.domain}`
        }
      };
      
      await fs.write(
        `pipeline-report-${Date.now()}.json`,
        JSON.stringify(report, null, 2)
      );
      
      log.info('Data pipeline deployment completed successfully!');
      return report;
    }))
  )
  
  .build();

// Helper functions
function parseRetention(retention: string): number {
  const match = retention.match(/(\d+)([dhm])/);
  if (!match) return 604800000; // Default 7 days
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    default: return 604800000;
  }
}

function generateETLDag(vars: any): string {
  return `
from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.spark.operators.spark_submit import SparkSubmitOperator
from airflow.operators.python import PythonOperator

default_args = {
    'owner': 'data-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5)
}

dag = DAG(
    'daily_etl',
    default_args=default_args,
    description='Daily ETL pipeline',
    schedule_interval=timedelta(days=1),
    catchup=False
)

extract = SparkSubmitOperator(
    task_id='extract_data',
    application='/opt/spark/apps/extract.py',
    conf={'spark.hadoop.fs.s3a.access.key': '{{ var.value.aws_access_key }}'},
    dag=dag
)

transform = SparkSubmitOperator(
    task_id='transform_data',
    application='/opt/spark/apps/transform.py',
    dag=dag
)

load = SparkSubmitOperator(
    task_id='load_data',
    application='/opt/spark/apps/load.py',
    dag=dag
)

extract >> transform >> load
`;
}

function generateAggregationDag(vars: any): string {
  return `
from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.apache.spark.operators.spark_sql import SparkSqlOperator

dag = DAG(
    'hourly_aggregation',
    schedule_interval='@hourly',
    start_date=datetime(2024, 1, 1),
    catchup=False
)

aggregate_metrics = SparkSqlOperator(
    task_id='aggregate_metrics',
    sql="""
        INSERT INTO metrics_hourly
        SELECT 
            date_trunc('hour', timestamp) as hour,
            COUNT(*) as event_count,
            AVG(value) as avg_value,
            MAX(value) as max_value,
            MIN(value) as min_value
        FROM events
        WHERE timestamp >= '{{ ds }}' AND timestamp < '{{ next_ds }}'
        GROUP BY 1
    """,
    conn_id='spark_default',
    dag=dag
)
`;
}

function generateDataQualityDag(vars: any): string {
  return `
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from great_expectations_provider.operators.great_expectations import GreatExpectationsOperator

dag = DAG(
    'data_quality',
    schedule_interval='@daily',
    start_date=datetime(2024, 1, 1),
    catchup=False
)

validate_raw_data = GreatExpectationsOperator(
    task_id='validate_raw_data',
    expectation_suite_name='raw_data_quality',
    batch_kwargs={
        'datasource': 'data_warehouse',
        'table': 'raw_events',
        'data_asset_name': 'raw_events'
    },
    dag=dag
)

validate_processed_data = GreatExpectationsOperator(
    task_id='validate_processed_data',
    expectation_suite_name='processed_data_quality',
    batch_kwargs={
        'datasource': 'data_warehouse',
        'table': 'processed_events',
        'data_asset_name': 'processed_events'
    },
    dag=dag
)
`;
}

function generateMLTrainingDag(vars: any): string {
  return `
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.cncf.kubernetes.operators.kubernetes_pod import KubernetesPodOperator

dag = DAG(
    'ml_training',
    schedule_interval='@weekly',
    start_date=datetime(2024, 1, 1),
    catchup=False
)

train_model = KubernetesPodOperator(
    task_id='train_model',
    name='ml-training-job',
    namespace='${vars.pipelineName}',
    image='${vars.pipelineName}/ml-training:latest',
    env_vars={
        'MLFLOW_TRACKING_URI': 'http://mlflow:5000',
        'S3_BUCKET': '${vars.pipelineName}-ml'
    },
    dag=dag
)
`;
}